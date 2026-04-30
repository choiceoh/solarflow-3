package ocr

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"testing"
	"time"
)

func TestOCRFileExtUsesMIMEAndMagicBytes(t *testing.T) {
	tests := []struct {
		name     string
		data     []byte
		mimeType string
		filename string
		want     string
	}{
		{name: "pdf mime", data: []byte("x"), mimeType: "application/pdf", filename: "scan.bin", want: ".pdf"},
		{name: "png magic", data: []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, filename: "scan", want: ".png"},
		{name: "jpg extension", data: []byte("x"), filename: "scan.jpeg", want: ".jpeg"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ocrFileExt(tt.data, tt.mimeType, tt.filename); got != tt.want {
				t.Fatalf("ocrFileExt() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestRecognizeUsesSidecarProtocol(t *testing.T) {
	t.Setenv("SOLARFLOW_OCR_HELPER", "1")

	client := New(os.Args[0], "-test.run=TestOCRSidecarHelperProcess")
	client.initTimeout = 2 * time.Second
	client.readTimeout = 2 * time.Second
	defer client.Cleanup()

	results, err := client.Recognize(context.Background(), "/tmp/spec.png")
	if err != nil {
		t.Fatalf("Recognize() error = %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("len(results) = %d, want 1", len(results))
	}
	if results[0].Text != "SolarFlow" || results[0].Score != 0.91 || results[0].X1 != 40 {
		t.Fatalf("result = %+v", results[0])
	}

	status := client.Health(context.Background(), false)
	if status.Status != "ready" || !status.Running || !status.Ready {
		t.Fatalf("status = %+v", status)
	}
}

func TestHealthReportsNotConfigured(t *testing.T) {
	status := New("").Health(context.Background(), false)
	if status.Status != "not_configured" || status.Configured {
		t.Fatalf("status = %+v", status)
	}
}

func TestOCRSidecarHelperProcess(t *testing.T) {
	if os.Getenv("SOLARFLOW_OCR_HELPER") != "1" {
		return
	}

	fmt.Println(`{"ready":true}`)
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		fmt.Println(`{"raw":[{"text":"SolarFlow","score":0.91,"x0":1,"y0":2,"x1":40,"y1":20}]}`)
	}
	os.Exit(0)
}
