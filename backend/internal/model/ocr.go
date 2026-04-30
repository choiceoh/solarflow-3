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
	Filename string    `json:"filename"`
	RawText  string    `json:"raw_text,omitempty"`
	Lines    []OCRLine `json:"lines,omitempty"`
	Error    string    `json:"error,omitempty"`
}

// OCRExtractResponse — 여러 파일 OCR 응답
type OCRExtractResponse struct {
	Results []OCRResult `json:"results"`
}
