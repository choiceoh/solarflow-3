package model

// OCRBox — OCR 텍스트가 발견된 영역 좌표
// 비유: 스캔한 종이 위에 형광펜으로 표시한 네모 위치
type OCRBox struct {
	X0 int `json:"x0"`
	Y0 int `json:"y0"`
	X1 int `json:"x1"`
	Y1 int `json:"y1"`
}

// OCRLine — PaddleOCR이 읽어낸 텍스트 한 줄
type OCRLine struct {
	Text  string  `json:"text"`
	Score float32 `json:"score"`
	Box   OCRBox  `json:"box"`
}

// OCRResult — 파일 1건의 OCR 처리 결과
type OCRResult struct {
	Filename string     `json:"filename"`
	RawText  string     `json:"raw_text,omitempty"`
	Lines    []OCRLine  `json:"lines,omitempty"`
	Error    string     `json:"error,omitempty"`
	Fields   *OCRFields `json:"fields,omitempty"`
}

// OCRExtractResponse — 여러 파일 OCR 응답
type OCRExtractResponse struct {
	Results []OCRResult `json:"results"`
}

// OCRFields — OCR 원문에서 업무 입력칸으로 옮길 수 있는 후보값
// 비유: 원문 위에 "이 값은 여기 칸에 들어갈 수 있음"이라고 붙인 포스트잇
type OCRFields struct {
	DocumentType       string                       `json:"document_type,omitempty"`
	CustomsDeclaration *CustomsDeclarationOCRFields `json:"customs_declaration,omitempty"`
}

// OCRFieldCandidate — OCR로 추정한 단일 입력 후보
type OCRFieldCandidate struct {
	Value      string  `json:"value"`
	Label      string  `json:"label,omitempty"`
	SourceText string  `json:"source_text,omitempty"`
	Confidence float32 `json:"confidence,omitempty"`
}

// CustomsDeclarationOCRFields — 수입필증/면장에서 B/L 입력폼으로 옮길 후보값
type CustomsDeclarationOCRFields struct {
	DeclarationNumber *OCRFieldCandidate          `json:"declaration_number,omitempty"`
	DeclarationDate   *OCRFieldCandidate          `json:"declaration_date,omitempty"`
	ArrivalDate       *OCRFieldCandidate          `json:"arrival_date,omitempty"`
	ReleaseDate       *OCRFieldCandidate          `json:"release_date,omitempty"`
	Importer          *OCRFieldCandidate          `json:"importer,omitempty"`
	Forwarder         *OCRFieldCandidate          `json:"forwarder,omitempty"`
	TradePartner      *OCRFieldCandidate          `json:"trade_partner,omitempty"`
	ExchangeRate      *OCRFieldCandidate          `json:"exchange_rate,omitempty"`
	CIFAmountKRW      *OCRFieldCandidate          `json:"cif_amount_krw,omitempty"`
	HSCode            *OCRFieldCandidate          `json:"hs_code,omitempty"`
	CustomsOffice     *OCRFieldCandidate          `json:"customs_office,omitempty"`
	Port              *OCRFieldCandidate          `json:"port,omitempty"`
	BLNumber          *OCRFieldCandidate          `json:"bl_number,omitempty"`
	InvoiceNumber     *OCRFieldCandidate          `json:"invoice_number,omitempty"`
	LineItems         []CustomsDeclarationLineOCR `json:"line_items,omitempty"`
}

// CustomsDeclarationLineOCR — 면장 품목 라인 후보
type CustomsDeclarationLineOCR struct {
	ModelSpec    *OCRFieldCandidate `json:"model_spec,omitempty"`
	Quantity     *OCRFieldCandidate `json:"quantity,omitempty"`
	UnitPriceUSD *OCRFieldCandidate `json:"unit_price_usd,omitempty"`
	AmountUSD    *OCRFieldCandidate `json:"amount_usd,omitempty"`
	PaymentType  *OCRFieldCandidate `json:"payment_type,omitempty"`
}
