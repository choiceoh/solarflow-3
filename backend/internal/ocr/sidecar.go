package ocr

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	defaultInitTimeout = 90 * time.Second
	defaultReadTimeout = 120 * time.Second
)

type Client struct {
	Command string
	Args    []string

	initTimeout time.Duration
	readTimeout time.Duration

	mu   sync.Mutex
	proc *sidecarProc
}

type sidecarProc struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout *bufio.Reader
	stderr bytes.Buffer
}

type Result struct {
	Text           string
	Score          float32
	X0, Y0, X1, Y1 int
}

type Status struct {
	Status     string   `json:"status"`
	Configured bool     `json:"configured"`
	Running    bool     `json:"running"`
	Ready      bool     `json:"ready"`
	Command    string   `json:"command,omitempty"`
	Args       []string `json:"args,omitempty"`
	Error      string   `json:"error,omitempty"`
}

type rawOutput struct {
	Raw []struct {
		Text  string  `json:"text"`
		Score float64 `json:"score"`
		X0    int     `json:"x0"`
		Y0    int     `json:"y0"`
		X1    int     `json:"x1"`
		Y1    int     `json:"y1"`
	} `json:"raw"`
	Ready bool   `json:"ready,omitempty"`
	Error string `json:"error,omitempty"`
}

func New(command string, args ...string) *Client {
	return &Client{
		Command:     command,
		Args:        args,
		initTimeout: defaultInitTimeout,
		readTimeout: defaultReadTimeout,
	}
}

func NewFromEnv() *Client {
	if command := strings.TrimSpace(os.Getenv("OCR_SIDECAR_PATH")); command != "" {
		return New(command, strings.Fields(os.Getenv("OCR_SIDECAR_ARGS"))...)
	}

	script := strings.TrimSpace(os.Getenv("OCR_SIDECAR_SCRIPT"))
	if script == "" {
		script = defaultSidecarScript()
	}
	if script != "" {
		python := strings.TrimSpace(os.Getenv("OCR_PYTHON_BIN"))
		if python == "" {
			python = defaultPythonBin()
		}
		return New(python, script)
	}

	return New("")
}

func (c *Client) Health(ctx context.Context, warm bool) Status {
	status := Status{
		Configured: strings.TrimSpace(c.Command) != "",
		Command:    c.Command,
		Args:       append([]string(nil), c.Args...),
	}
	if !status.Configured {
		status.Status = "not_configured"
		status.Error = "OCR_SIDECAR_PATH 또는 OCR_SIDECAR_SCRIPT가 설정되지 않았고 기본 PaddleOCR sidecar 스크립트를 찾지 못했습니다"
		return status
	}

	c.mu.Lock()
	status.Running = c.proc != nil
	status.Ready = c.proc != nil
	c.mu.Unlock()

	if warm {
		if err := c.Warm(ctx); err != nil {
			status.Status = "error"
			status.Error = err.Error()
			c.mu.Lock()
			status.Running = c.proc != nil
			status.Ready = false
			c.mu.Unlock()
			return status
		}
		status.Running = true
		status.Ready = true
	}

	if status.Ready {
		status.Status = "ready"
	} else {
		status.Status = "idle"
	}
	return status
}

func (c *Client) Warm(ctx context.Context) error {
	if strings.TrimSpace(c.Command) == "" {
		return fmt.Errorf("OCR_SIDECAR_PATH 또는 OCR_SIDECAR_SCRIPT가 설정되지 않았고 기본 PaddleOCR sidecar 스크립트를 찾지 못했습니다")
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if c.proc != nil {
		return nil
	}
	return c.spawnLocked(ctx)
}

func (c *Client) RecognizeBytes(ctx context.Context, data []byte, mimeType string, filename string) ([]Result, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("빈 파일은 OCR 처리할 수 없습니다")
	}

	ext := ocrFileExt(data, mimeType, filename)
	dir, err := os.UserCacheDir()
	if err != nil {
		dir = os.TempDir()
	}
	tmp, err := os.CreateTemp(dir, "solarflow-ocr-*"+ext)
	if err != nil {
		return nil, fmt.Errorf("OCR 임시 파일 생성 실패: %w", err)
	}
	defer os.Remove(tmp.Name())

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return nil, fmt.Errorf("OCR 임시 파일 쓰기 실패: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return nil, fmt.Errorf("OCR 임시 파일 닫기 실패: %w", err)
	}

	return c.Recognize(ctx, tmp.Name())
}

func (c *Client) Recognize(ctx context.Context, path string) ([]Result, error) {
	if strings.TrimSpace(c.Command) == "" {
		return nil, fmt.Errorf("OCR_SIDECAR_PATH 또는 OCR_SIDECAR_SCRIPT가 설정되지 않았고 기본 PaddleOCR sidecar 스크립트를 찾지 못했습니다")
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if c.proc == nil {
		if err := c.spawnLocked(ctx); err != nil {
			return nil, err
		}
	}

	if _, err := c.proc.stdin.Write([]byte(path + "\n")); err != nil {
		c.killLocked()
		if err := c.spawnLocked(ctx); err != nil {
			return nil, fmt.Errorf("OCR sidecar 재시작 실패: %w", err)
		}
		if _, err := c.proc.stdin.Write([]byte(path + "\n")); err != nil {
			return nil, fmt.Errorf("OCR sidecar 경로 전송 실패: %w", err)
		}
	}

	line, err := c.readLine(ctx, c.readTimeout)
	if err != nil {
		c.killLocked()
		return nil, err
	}

	var parsed rawOutput
	if err := json.Unmarshal(line, &parsed); err != nil {
		return nil, fmt.Errorf("OCR sidecar 응답 해석 실패: %w (raw=%s)", err, strings.TrimSpace(string(line)))
	}
	if parsed.Error != "" {
		return nil, fmt.Errorf("OCR sidecar: %s", parsed.Error)
	}

	results := make([]Result, 0, len(parsed.Raw))
	for _, r := range parsed.Raw {
		results = append(results, Result{
			Text:  r.Text,
			Score: float32(r.Score),
			X0:    r.X0,
			Y0:    r.Y0,
			X1:    r.X1,
			Y1:    r.Y1,
		})
	}
	return results, nil
}

func (c *Client) Cleanup() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.killLocked()
}

func (c *Client) spawnLocked(ctx context.Context) error {
	cmd := exec.Command(c.Command, c.Args...)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("OCR sidecar stdin 연결 실패: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("OCR sidecar stdout 연결 실패: %w", err)
	}
	proc := &sidecarProc{cmd: cmd, stdin: stdin}
	cmd.Stderr = &proc.stderr
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("OCR sidecar 시작 실패: %w", err)
	}
	proc.stdout = bufio.NewReaderSize(stdout, 1<<20)
	c.proc = proc

	line, err := c.readLine(ctx, c.initTimeout)
	if err != nil {
		c.killLocked()
		return fmt.Errorf("OCR sidecar 준비 실패: %w", err)
	}

	var msg rawOutput
	if err := json.Unmarshal(line, &msg); err != nil {
		c.killLocked()
		return fmt.Errorf("OCR sidecar ready 응답 해석 실패: %w", err)
	}
	if msg.Error != "" {
		c.killLocked()
		return fmt.Errorf("OCR sidecar 준비 오류: %s", msg.Error)
	}
	if !msg.Ready {
		c.killLocked()
		return fmt.Errorf("OCR sidecar 첫 응답이 ready가 아닙니다: %s", strings.TrimSpace(string(line)))
	}
	return nil
}

func (c *Client) readLine(ctx context.Context, timeout time.Duration) ([]byte, error) {
	proc := c.proc
	if proc == nil || proc.stdout == nil {
		return nil, fmt.Errorf("OCR sidecar 프로세스가 준비되지 않았습니다")
	}

	type readResult struct {
		line []byte
		err  error
	}
	ch := make(chan readResult, 1)
	go func() {
		line, err := proc.stdout.ReadBytes('\n')
		ch <- readResult{line: line, err: err}
	}()

	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-timer.C:
		return nil, fmt.Errorf("OCR sidecar 응답 시간 초과(%s); stderr=%s", timeout, proc.stderr.String())
	case res := <-ch:
		if res.err != nil {
			return nil, fmt.Errorf("OCR sidecar 응답 읽기 실패: %w; stderr=%s", res.err, proc.stderr.String())
		}
		return res.line, nil
	}
}

func (c *Client) killLocked() {
	if c.proc == nil {
		return
	}
	proc := c.proc
	if proc.stdin != nil {
		_ = proc.stdin.Close()
	}
	if proc.cmd != nil && proc.cmd.Process != nil {
		done := make(chan struct{})
		go func() {
			_ = proc.cmd.Wait()
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(3 * time.Second):
			_ = proc.cmd.Process.Kill()
		}
	}
	c.proc = nil
}

func defaultSidecarScript() string {
	roots := candidateRoots()
	candidates := []string{
		filepath.Join("internal", "ocr", "sidecar-src", "rapidocr_main.py"),
		filepath.Join("backend", "internal", "ocr", "sidecar-src", "rapidocr_main.py"),
	}
	for _, root := range roots {
		for _, candidate := range candidates {
			path := filepath.Join(root, candidate)
			if _, err := os.Stat(path); err == nil {
				return path
			}
		}
	}
	return ""
}

func defaultPythonBin() string {
	roots := candidateRoots()
	candidates := []string{
		filepath.Join(".venv-ocr", "bin", "python"),
		filepath.Join(".venv-ocr", "Scripts", "python.exe"),
		filepath.Join("backend", ".venv-ocr", "bin", "python"),
		filepath.Join("backend", ".venv-ocr", "Scripts", "python.exe"),
	}
	for _, root := range roots {
		for _, candidate := range candidates {
			path := filepath.Join(root, candidate)
			if _, err := os.Stat(path); err == nil {
				return path
			}
		}
	}
	return "python3"
}

func candidateRoots() []string {
	seen := map[string]struct{}{}
	var roots []string
	add := func(path string) {
		if path == "" {
			return
		}
		abs, err := filepath.Abs(path)
		if err != nil {
			return
		}
		if _, ok := seen[abs]; ok {
			return
		}
		seen[abs] = struct{}{}
		roots = append(roots, abs)
	}

	if cwd, err := os.Getwd(); err == nil {
		add(cwd)
		add(filepath.Dir(cwd))
	}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		add(exeDir)
		add(filepath.Dir(exeDir))
	}
	return roots
}

func ocrFileExt(data []byte, mimeType string, filename string) string {
	switch strings.ToLower(strings.TrimSpace(strings.Split(mimeType, ";")[0])) {
	case "application/pdf":
		return ".pdf"
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	}

	if len(data) >= 4 && string(data[:4]) == "%PDF" {
		return ".pdf"
	}
	if len(data) >= 3 && string(data[:3]) == "\xff\xd8\xff" {
		return ".jpg"
	}
	if len(data) >= 8 && string(data[:8]) == "\x89PNG\r\n\x1a\n" {
		return ".png"
	}

	switch strings.ToLower(filepath.Ext(filename)) {
	case ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif":
		return strings.ToLower(filepath.Ext(filename))
	default:
		switch http.DetectContentType(data) {
		case "application/pdf":
			return ".pdf"
		case "image/jpeg":
			return ".jpg"
		case "image/png":
			return ".png"
		case "image/webp":
			return ".webp"
		case "image/gif":
			return ".gif"
		}
		return ".png"
	}
}
