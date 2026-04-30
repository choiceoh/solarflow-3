package ocrparse

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"solarflow-backend/internal/model"
)

var (
	compactSpaceRe          = regexp.MustCompile(`\s+`)
	declarationNoLabelRe    = regexp.MustCompile(`(?i)(?:수입)?신고\s*(?:번호|NO\.?)?\s*[:：\-]?\s*([A-Z]{0,4}\s*\d{3,5}[\s\-]?\d{2}[\s\-]?[A-Z0-9]{5,9}|[A-Z]{2,4}\s*\d{8,14})`)
	declarationNoFallbackRe = regexp.MustCompile(`(?i)\b(?:[A-Z]{2,4}\s*)?\d{5}[\s\-]?\d{2}[\s\-]?[A-Z0-9]{5,9}\b|\b[A-Z]{2,4}\s*\d{8,14}\b`)
	hsCodeRe                = regexp.MustCompile(`\b(\d{4}[.\-\s]?\d{2}[.\-\s]?\d{4}|\d{10})\b`)
	dateDotRe               = regexp.MustCompile(`\b(20\d{2})[년./\-\s]*(\d{1,2})[월./\-\s]*(\d{1,2})\s*일?\b`)
	numberRe                = regexp.MustCompile(`\d[\d,]*(?:\.\d+)?`)
	exchangeRateRe          = regexp.MustCompile(`(?:환율|적용환율|exchange\s*rate|rate)[^\d]{0,16}([1-9]\d{0,2}(?:,\d{3})*(?:\.\d{1,4})?|[1-9]\d{3,4}(?:\.\d{1,4})?)`)
	identifierRe            = regexp.MustCompile(`(?i)\b[A-Z]{2,}[A-Z0-9\-\/]{5,35}\b`)
	itemNoRe                = regexp.MustCompile(`(?i)\(?\s*NO\.\s*\d+\s*\)?`)
	pcsRe                   = regexp.MustCompile(`(?i)([\d,]+)\s*PCS\b`)
	modelLikeRe             = regexp.MustCompile(`(?i)(LR\d[-A-Z0-9]*|[A-Z0-9]{2,}[-][A-Z0-9\-]{4,})`)
	blNoRe                  = regexp.MustCompile(`(?i)(?:B\s*/?\s*L|BILL\s+OF\s+LADING|선하증권)\s*(?:NO\.?|번호)?\s*[:：\-]?\s*([A-Z0-9][A-Z0-9\-\/]{5,35})`)
	invoiceNoRe             = regexp.MustCompile(`(?i)(?:INVOICE|송장|상업송장|C\s*/?\s*I)\s*(?:NO\.?|번호)?\s*[:：\-]?\s*([A-Z0-9][A-Z0-9\-\/]{4,35})`)
	customsOfficeRe         = regexp.MustCompile(`([가-힣]{2,10}세관(?:[가-힣]{0,8})?)`)
	importerRe              = regexp.MustCompile(`(?i)(TOP\s*SOLAR|TOPSOLAR|탑솔라(?:\s*\(?주\)?)?)`)
	tradePartnerRe          = regexp.MustCompile(`(?i)([A-Z][A-Z0-9&.,\-\s]{4,80}(?:CO\.?\s*LTD|CO\s+LTD|LIMITED|INC\.?|CORP\.?))`)
)

var knownPorts = []string{
	"광양항", "부산항", "평택항", "인천항", "울산항", "군산항", "목포항", "마산항", "여수항",
}

// ParseCustomsDeclaration — 수입필증 OCR 원문에서 B/L 입력폼 후보값을 뽑는다.
// 비유: 종이 면장의 여러 숫자 중 입력칸에 옮겨 적을 만한 숫자에만 색인표를 붙인다.
func ParseCustomsDeclaration(filename string, lines []model.OCRLine) *model.CustomsDeclarationOCRFields {
	parsed := &model.CustomsDeclarationOCRFields{}
	all := make([]model.OCRLine, 0, len(lines)+1)
	all = append(all, lines...)
	if strings.TrimSpace(filename) != "" {
		all = append(all, model.OCRLine{Text: filename, Score: 0.55})
	}

	for _, line := range all {
		text := cleanLine(line.Text)
		if text == "" {
			continue
		}
		lower := strings.ToLower(text)

		if parsed.DeclarationNumber == nil && (strings.Contains(text, "신고") || strings.Contains(lower, "dfs")) {
			if match := declarationNoLabelRe.FindStringSubmatch(text); len(match) > 1 {
				parsed.DeclarationNumber = newCandidate(normalizeIdentifier(match[1]), "면장번호", text, line.Score)
			}
		}
		if parsed.DeclarationNumber == nil {
			if match := declarationNoFallbackRe.FindString(text); match != "" && looksLikeDeclarationNumber(match) {
				parsed.DeclarationNumber = newCandidate(normalizeIdentifier(match), "면장번호", text, line.Score)
			}
		}

		if parsed.ExchangeRate == nil {
			if match := exchangeRateRe.FindStringSubmatch(text); len(match) > 1 {
				if value := normalizeDecimal(match[1]); value != "" && looksLikeExchangeRate(value) {
					parsed.ExchangeRate = newCandidate(value, "면장환율", text, line.Score)
				}
			}
		}

		if parsed.CIFAmountKRW == nil && hasAny(text, "CIF", "C.I.F", "과세가격", "가격(원화)", "원화금액") {
			if amount := largestWonAmount(text); amount != "" {
				parsed.CIFAmountKRW = newCandidate(amount, "면장 CIF 원화금액", text, line.Score)
			}
		}

		if parsed.HSCode == nil && hasAny(text, "HS", "세번", "품목번호", "세번부호") {
			if match := hsCodeRe.FindStringSubmatch(text); len(match) > 1 {
				parsed.HSCode = newCandidate(normalizeHSCode(match[1]), "HS코드", text, line.Score)
			}
		}
		if parsed.HSCode == nil && strings.Contains(text, "8541") {
			if match := hsCodeRe.FindStringSubmatch(text); len(match) > 1 {
				parsed.HSCode = newCandidate(normalizeHSCode(match[1]), "HS코드", text, line.Score)
			}
		}

		if parsed.CustomsOffice == nil {
			if match := customsOfficeRe.FindStringSubmatch(text); len(match) > 1 {
				parsed.CustomsOffice = newCandidate(match[1], "세관", text, line.Score)
			}
		}

		if parsed.Port == nil {
			if port := findPort(text); port != "" {
				parsed.Port = newCandidate(port, "항구", text, line.Score)
			}
		}

		if parsed.Importer == nil {
			if match := importerRe.FindStringSubmatch(text); len(match) > 1 {
				parsed.Importer = newCandidate(cleanLine(match[1]), "수입자", text, line.Score)
			}
		}

		if parsed.Forwarder == nil && hasAny(text, "운송주선인", "FORWARDER", "FORWARDING") {
			if value := labelTail(text); value != "" {
				parsed.Forwarder = newCandidate(value, "운송주선인", text, line.Score)
			}
		}

		if parsed.TradePartner == nil {
			if match := tradePartnerRe.FindStringSubmatch(text); len(match) > 1 && !hasAny(match[1], "MASTERB", "UNIPASS") {
				parsed.TradePartner = newCandidate(cleanLine(match[1]), "무역거래처", text, line.Score)
			}
		}

		if parsed.BLNumber == nil && hasAny(text, "B/L", "BL", "선하증권", "Bill of Lading") {
			if match := blNoRe.FindStringSubmatch(text); len(match) > 1 && !looksLikeDate(match[1]) {
				parsed.BLNumber = newCandidate(strings.Trim(match[1], " -:/"), "B/L번호", text, line.Score)
			}
		}

		if parsed.InvoiceNumber == nil && hasAny(lower, "invoice", "c/i", "송장", "상업송장") {
			if match := invoiceNoRe.FindStringSubmatch(text); len(match) > 1 && !looksLikeDate(match[1]) {
				parsed.InvoiceNumber = newCandidate(strings.Trim(match[1], " -:/"), "Invoice No.", text, line.Score)
			}
		}

		if date := firstDate(text); date != "" {
			assignDateCandidate(parsed, text, date, line.Score)
		}
	}
	applyCoordinateFallbacks(parsed, lines)
	applyDateFallbacks(parsed, filename, lines)
	parsed.LineItems = parseLineItems(lines)

	if isEmptyCustomsDeclaration(parsed) {
		return nil
	}
	return parsed
}

func assignDateCandidate(parsed *model.CustomsDeclarationOCRFields, source string, date string, score float32) {
	switch {
	case parsed.ArrivalDate == nil && hasAny(source, "입항", "도착", "반입"):
		parsed.ArrivalDate = newCandidate(date, "입항일", source, score)
	case parsed.ReleaseDate == nil && hasAny(source, "수리", "반출"):
		parsed.ReleaseDate = newCandidate(date, "반출/수리일", source, score)
	case parsed.DeclarationDate == nil && hasAny(source, "신고", "접수"):
		parsed.DeclarationDate = newCandidate(date, "신고일", source, score)
	}
}

func applyCoordinateFallbacks(parsed *model.CustomsDeclarationOCRFields, lines []model.OCRLine) {
	if parsed.BLNumber == nil {
		if candidate := findNearbyIdentifier(lines, func(text string) bool {
			return hasAny(text, "B/L", "BL", "BILL OF LADING", "선하증권")
		}); candidate != nil {
			parsed.BLNumber = candidate
		}
	}
	if parsed.ExchangeRate == nil {
		if candidate := findNearbyExchangeRate(lines); candidate != nil {
			parsed.ExchangeRate = candidate
		}
	}
	if parsed.CIFAmountKRW == nil {
		if candidate := findLargestWonAmount(lines); candidate != nil {
			parsed.CIFAmountKRW = candidate
		}
	}
	if parsed.Port == nil {
		for _, line := range lines {
			if port := findPort(line.Text); port != "" {
				parsed.Port = newCandidate(port, "항구", cleanLine(line.Text), line.Score)
				return
			}
		}
	}
}

func applyDateFallbacks(parsed *model.CustomsDeclarationOCRFields, filename string, lines []model.OCRLine) {
	dates := make([]struct {
		value string
		line  model.OCRLine
	}, 0)
	for _, line := range lines {
		if date := firstDate(line.Text); date != "" {
			dates = append(dates, struct {
				value string
				line  model.OCRLine
			}{value: date, line: line})
		}
	}
	if date := firstDate(filename); date != "" {
		dates = append(dates, struct {
			value string
			line  model.OCRLine
		}{value: date, line: model.OCRLine{Text: filename, Score: 0.55}})
	}
	if len(dates) == 0 {
		return
	}
	sort.SliceStable(dates, func(i, j int) bool {
		if dates[i].value == dates[j].value {
			if dates[i].line.Box.Y0 == dates[j].line.Box.Y0 {
				return dates[i].line.Box.X0 < dates[j].line.Box.X0
			}
			return dates[i].line.Box.Y0 < dates[j].line.Box.Y0
		}
		return dates[i].value < dates[j].value
	})
	if parsed.ArrivalDate == nil && len(dates) > 1 {
		first := dates[0]
		parsed.ArrivalDate = newCandidate(first.value, "입항일", cleanLine(first.line.Text), first.line.Score)
	}
	if parsed.DeclarationDate == nil {
		last := dates[len(dates)-1]
		parsed.DeclarationDate = newCandidate(last.value, "신고일", cleanLine(last.line.Text), last.line.Score)
	}
}

func findNearbyIdentifier(lines []model.OCRLine, isLabel func(string) bool) *model.OCRFieldCandidate {
	var best *model.OCRLine
	bestDistance := 1 << 30
	for _, label := range lines {
		if !isLabel(label.Text) {
			continue
		}
		for _, line := range lines {
			text := cleanLine(line.Text)
			if text == "" || text == cleanLine(label.Text) || looksLikeDate(text) {
				continue
			}
			if line.Box.Y0 < label.Box.Y0-8 || line.Box.Y0 > label.Box.Y1+90 {
				continue
			}
			match := identifierRe.FindString(text)
			if match == "" {
				continue
			}
			distance := abs(line.Box.Y0-label.Box.Y0) + abs(line.Box.X0-label.Box.X0)
			if best == nil || distance < bestDistance {
				copied := line
				best = &copied
				bestDistance = distance
			}
		}
	}
	if best == nil {
		return nil
	}
	return newCandidate(identifierRe.FindString(cleanLine(best.Text)), "B/L번호", cleanLine(best.Text), best.Score)
}

func findNearbyExchangeRate(lines []model.OCRLine) *model.OCRFieldCandidate {
	var fallback *model.OCRLine
	for _, label := range lines {
		if !hasAny(label.Text, "CIF", "C.I.F", "환율", "USD") {
			continue
		}
		for _, line := range lines {
			if abs(line.Box.Y0-label.Box.Y0) > 45 {
				continue
			}
			value := exchangeRateFromLine(line.Text)
			if value == "" {
				continue
			}
			if hasAny(label.Text, "CIF", "환율") {
				return newCandidate(value, "면장환율", cleanLine(line.Text), line.Score)
			}
			copied := line
			fallback = &copied
		}
	}
	if fallback != nil {
		return newCandidate(exchangeRateFromLine(fallback.Text), "면장환율", cleanLine(fallback.Text), fallback.Score)
	}
	for _, line := range lines {
		if value := exchangeRateFromLine(line.Text); value != "" {
			return newCandidate(value, "면장환율", cleanLine(line.Text), line.Score)
		}
	}
	return nil
}

func exchangeRateFromLine(text string) string {
	for _, match := range numberRe.FindAllString(text, -1) {
		if !strings.Contains(match, ".") {
			continue
		}
		value := normalizeDecimal(match)
		if value != "" && looksLikeExchangeRate(value) {
			return value
		}
	}
	return ""
}

func findLargestWonAmount(lines []model.OCRLine) *model.OCRFieldCandidate {
	var best *model.OCRLine
	var bestValue int64
	for _, line := range lines {
		for _, match := range numberRe.FindAllString(line.Text, -1) {
			if strings.Contains(match, ".") {
				continue
			}
			normalized := strings.ReplaceAll(match, ",", "")
			parsed, err := strconv.ParseInt(normalized, 10, 64)
			if err == nil && parsed >= 100000000 && parsed > bestValue {
				copied := line
				best = &copied
				bestValue = parsed
			}
		}
	}
	if best == nil {
		return nil
	}
	return newCandidate(strconv.FormatInt(bestValue, 10), "면장 CIF 원화금액", cleanLine(best.Text), best.Score)
}

func parseLineItems(lines []model.OCRLine) []model.CustomsDeclarationLineOCR {
	if len(lines) == 0 {
		return nil
	}
	sorted := append([]model.OCRLine(nil), lines...)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].Box.Y0 == sorted[j].Box.Y0 {
			return sorted[i].Box.X0 < sorted[j].Box.X0
		}
		return sorted[i].Box.Y0 < sorted[j].Box.Y0
	})

	starts := make([]int, 0)
	for i, line := range sorted {
		if itemNoRe.MatchString(line.Text) {
			starts = append(starts, i)
		}
	}
	items := make([]model.CustomsDeclarationLineOCR, 0, len(starts))
	for idx, start := range starts {
		end := len(sorted)
		if idx+1 < len(starts) {
			end = starts[idx+1]
		}
		item := parseLineItemSection(sorted[start:end])
		if item.ModelSpec != nil || item.Quantity != nil || item.AmountUSD != nil {
			items = append(items, item)
		}
	}
	return items
}

func parseLineItemSection(section []model.OCRLine) model.CustomsDeclarationLineOCR {
	var item model.CustomsDeclarationLineOCR
	joined := make([]string, 0, len(section))
	for _, line := range section {
		text := cleanLine(line.Text)
		if text == "" {
			continue
		}
		joined = append(joined, text)
		if item.Quantity == nil {
			if match := pcsRe.FindStringSubmatch(text); len(match) > 1 {
				item.Quantity = newCandidate(strings.ReplaceAll(match[1], ",", ""), "수량", text, line.Score)
			}
		}
		if item.UnitPriceUSD == nil {
			if value := unitPriceFromLine(text); value != "" {
				item.UnitPriceUSD = newCandidate(value, "단가(USD)", text, line.Score)
			}
		}
		if item.PaymentType == nil && hasAny(text, "FREE", "SPARE", "N.C.V") {
			item.PaymentType = newCandidate("free", "유무상", text, line.Score)
		}
	}
	if item.PaymentType == nil {
		item.PaymentType = newCandidate("paid", "유무상", strings.Join(joined, " "), 0)
	}
	if modelSpec := modelSpecFromSection(section); modelSpec != nil {
		item.ModelSpec = modelSpec
	}
	if amount := amountUSDFromSection(section); amount != nil {
		item.AmountUSD = amount
	}
	return item
}

func modelSpecFromSection(section []model.OCRLine) *model.OCRFieldCandidate {
	parts := make([]string, 0, 3)
	var score float32
	for _, line := range section {
		text := cleanLine(line.Text)
		if hasAny(text, "MODULE", "SOLAR") || modelLikeRe.MatchString(text) || pcsRe.MatchString(text) {
			parts = append(parts, text)
			if line.Score > score {
				score = line.Score
			}
		}
	}
	if len(parts) == 0 {
		return nil
	}
	source := strings.Join(parts, " ")
	return newCandidate(source, "모델/규격", source, score)
}

func unitPriceFromLine(text string) string {
	for _, match := range numberRe.FindAllString(text, -1) {
		value := normalizeDecimal(match)
		if value == "" || !strings.Contains(match, ".") {
			continue
		}
		parsed, err := strconv.ParseFloat(value, 64)
		if err == nil && parsed > 0 && parsed < 10 {
			return value
		}
	}
	return ""
}

func amountUSDFromSection(section []model.OCRLine) *model.OCRFieldCandidate {
	var best *model.OCRLine
	var bestValue float64
	var bestText string
	for _, line := range section {
		for _, match := range numberRe.FindAllString(line.Text, -1) {
			value := normalizeDecimal(match)
			if value == "" || !strings.Contains(match, ".") {
				continue
			}
			parsed, err := strconv.ParseFloat(value, 64)
			if err == nil && parsed >= 100 && parsed > bestValue {
				copied := line
				best = &copied
				bestValue = parsed
				bestText = value
			}
		}
	}
	if best == nil {
		return nil
	}
	return newCandidate(bestText, "금액(USD)", cleanLine(best.Text), best.Score)
}

func newCandidate(value string, label string, source string, score float32) *model.OCRFieldCandidate {
	return &model.OCRFieldCandidate{
		Value:      value,
		Label:      label,
		SourceText: source,
		Confidence: score,
	}
}

func cleanLine(text string) string {
	return strings.TrimSpace(compactSpaceRe.ReplaceAllString(text, " "))
}

func hasAny(text string, needles ...string) bool {
	lower := strings.ToLower(text)
	for _, needle := range needles {
		if strings.Contains(lower, strings.ToLower(needle)) {
			return true
		}
	}
	return false
}

func labelTail(text string) string {
	for _, sep := range []string{":", "：", "-", " "} {
		parts := strings.SplitN(text, sep, 2)
		if len(parts) == 2 {
			tail := cleanLine(parts[1])
			if tail != "" && !numberRe.MatchString(tail) {
				return tail
			}
		}
	}
	return ""
}

func normalizeIdentifier(value string) string {
	return strings.ToUpper(strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' {
			return r
		}
		return -1
	}, value))
}

func looksLikeDeclarationNumber(value string) bool {
	normalized := normalizeIdentifier(value)
	digits := 0
	for _, r := range normalized {
		if unicode.IsDigit(r) {
			digits++
		}
	}
	return digits >= 9 && digits <= 16
}

func normalizeDecimal(value string) string {
	cleaned := strings.ReplaceAll(strings.TrimSpace(value), ",", "")
	if _, err := strconv.ParseFloat(cleaned, 64); err != nil {
		return ""
	}
	return cleaned
}

func looksLikeExchangeRate(value string) bool {
	parsed, err := strconv.ParseFloat(value, 64)
	return err == nil && parsed >= 500 && parsed <= 2500
}

func largestWonAmount(text string) string {
	matches := numberRe.FindAllString(text, -1)
	values := make([]int64, 0, len(matches))
	for _, match := range matches {
		normalized := strings.ReplaceAll(match, ",", "")
		if strings.Contains(normalized, ".") {
			continue
		}
		parsed, err := strconv.ParseInt(normalized, 10, 64)
		if err == nil && parsed >= 1000000 {
			values = append(values, parsed)
		}
	}
	if len(values) == 0 {
		return ""
	}
	sort.Slice(values, func(i, j int) bool { return values[i] > values[j] })
	return strconv.FormatInt(values[0], 10)
}

func normalizeHSCode(value string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsDigit(r) {
			return r
		}
		return -1
	}, value)
}

func findPort(text string) string {
	for _, port := range knownPorts {
		if strings.Contains(text, port) {
			return port
		}
	}
	upper := strings.ToUpper(text)
	switch {
	case strings.Contains(upper, "KRKAN"):
		return "광양항"
	case strings.Contains(upper, "KRPUS"):
		return "부산항"
	case strings.Contains(upper, "KRINC"):
		return "인천항"
	case strings.Contains(upper, "KRPTK"):
		return "평택항"
	}
	return ""
}

func firstDate(text string) string {
	match := dateDotRe.FindStringSubmatch(text)
	if len(match) < 4 {
		return ""
	}
	month, monthErr := strconv.Atoi(match[2])
	day, dayErr := strconv.Atoi(match[3])
	if monthErr != nil || dayErr != nil || month < 1 || month > 12 || day < 1 || day > 31 {
		return ""
	}
	return match[1] + "-" + twoDigits(month) + "-" + twoDigits(day)
}

func twoDigits(value int) string {
	if value < 10 {
		return "0" + strconv.Itoa(value)
	}
	return strconv.Itoa(value)
}

func looksLikeDate(value string) bool {
	return firstDate(value) != ""
}

func abs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

func isEmptyCustomsDeclaration(parsed *model.CustomsDeclarationOCRFields) bool {
	return parsed.DeclarationNumber == nil &&
		parsed.DeclarationDate == nil &&
		parsed.ArrivalDate == nil &&
		parsed.ReleaseDate == nil &&
		parsed.Importer == nil &&
		parsed.Forwarder == nil &&
		parsed.TradePartner == nil &&
		parsed.ExchangeRate == nil &&
		parsed.CIFAmountKRW == nil &&
		parsed.HSCode == nil &&
		parsed.CustomsOffice == nil &&
		parsed.Port == nil &&
		parsed.BLNumber == nil &&
		parsed.InvoiceNumber == nil &&
		len(parsed.LineItems) == 0
}
