import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadDotEnv(filePath = path.join(packageRoot, '.env')) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex <= 0) continue;

    const key = trimmed.slice(0, equalIndex).trim();
    const rawValue = trimmed.slice(equalIndex + 1).trim();
    if (process.env[key] !== undefined) continue;

    process.env[key] = stripEnvQuotes(rawValue);
  }
}

export function loadConfig(command) {
  loadDotEnv();

  const config = {
    command,
    apiURL: normalizeAPIURL(env('SOLARFLOW_API_URL', 'http://localhost:8080')),
    accessToken: env('SOLARFLOW_ACCESS_TOKEN', ''),
    rpaToken: env('SOLARFLOW_AMARANTH_RPA_TOKEN', ''),
    amaranthUploadURL: env('AMARANTH_OUTBOUND_UPLOAD_URL', ''),
    userDataDir: resolveLocalPath(env('AMARANTH_USER_DATA_DIR', '.profile')),
    downloadDir: resolveLocalPath(env('AMARANTH_DOWNLOAD_DIR', 'downloads')),
    artifactDir: resolveLocalPath(env('AMARANTH_ARTIFACT_DIR', 'artifacts')),
    headless: parseBool(env('AMARANTH_HEADLESS', 'false')),
    browserChannel: normalizeBrowserChannel(env('AMARANTH_BROWSER_CHANNEL', 'auto')),
    autoLogin: parseBool(env('AMARANTH_AUTO_LOGIN', 'false')),
    companyCode: env('AMARANTH_COMPANY_CODE', ''),
    loginUserID: env('AMARANTH_USER_ID', ''),
    loginPassword: env('AMARANTH_PASSWORD', ''),
    timeoutMs: parsePositiveInt(env('AMARANTH_TIMEOUT_MS', '30000'), 'AMARANTH_TIMEOUT_MS'),
    fileChooserTimeoutMs: parsePositiveInt(env('AMARANTH_FILE_CHOOSER_TIMEOUT_MS', '15000'), 'AMARANTH_FILE_CHOOSER_TIMEOUT_MS'),
    pollIntervalMs: parsePositiveInt(env('AMARANTH_POLL_INTERVAL_MS', '30000'), 'AMARANTH_POLL_INTERVAL_MS'),
    maxJobsPerRun: parsePositiveInt(env('AMARANTH_MAX_JOBS_PER_RUN', '1'), 'AMARANTH_MAX_JOBS_PER_RUN'),
    pageReadyRegex: parseRegex(env('AMARANTH_PAGE_READY_TEXT', '출고등록엑셀업로드'), 'AMARANTH_PAGE_READY_TEXT'),
    loginRequiredRegex: parseRegex(env('AMARANTH_LOGIN_REQUIRED_TEXT', '로그인|아이디|비밀번호'), 'AMARANTH_LOGIN_REQUIRED_TEXT'),
    loginNextRegex: parseRegex(env('AMARANTH_LOGIN_NEXT_TEXT', '다음'), 'AMARANTH_LOGIN_NEXT_TEXT'),
    loginSubmitRegex: parseRegex(env('AMARANTH_LOGIN_SUBMIT_TEXT', '로그인'), 'AMARANTH_LOGIN_SUBMIT_TEXT'),
    featureMenuRegex: parseRegex(env('AMARANTH_FEATURE_MENU_TEXT', '기능모음'), 'AMARANTH_FEATURE_MENU_TEXT'),
    uploadMenuRegex: parseRegex(env('AMARANTH_UPLOAD_MENU_TEXT', '엑셀\\s*업로드|파일\\s*업로드'), 'AMARANTH_UPLOAD_MENU_TEXT'),
    convertConfirmRegex: parseRegex(env('AMARANTH_CONVERT_CONFIRM_TEXT', '변환\\s*확인'), 'AMARANTH_CONVERT_CONFIRM_TEXT'),
    successRegex: parseRegex(env('AMARANTH_SUCCESS_TEXT', '정상\\s*처리|업로드\\s*완료|변환\\s*완료|성공적으로|완료되었습니다'), 'AMARANTH_SUCCESS_TEXT'),
    failureRegex: parseRegex(env('AMARANTH_FAILURE_TEXT', '실패|오류|에러|필수|중복|등록불가'), 'AMARANTH_FAILURE_TEXT'),
  };

  validateConfig(config);
  return config;
}

export function ensureRuntimeDirs(config) {
  for (const dir of [config.userDataDir, config.downloadDir, config.artifactDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function validateConfig(config) {
  if (!config.amaranthUploadURL && config.command !== 'help') {
    throw new Error('AMARANTH_OUTBOUND_UPLOAD_URL을 설정해야 합니다');
  }
  if (!config.accessToken && !config.rpaToken && config.command !== 'login' && config.command !== 'help') {
    throw new Error('SOLARFLOW_ACCESS_TOKEN 또는 SOLARFLOW_AMARANTH_RPA_TOKEN을 설정해야 합니다');
  }
  if (config.autoLogin && (!config.loginUserID || !config.loginPassword)) {
    throw new Error('AMARANTH_AUTO_LOGIN=true이면 AMARANTH_USER_ID와 AMARANTH_PASSWORD가 필요합니다');
  }
}

function env(key, fallback) {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') return fallback;
  return value.trim();
}

function stripEnvQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function normalizeAPIURL(value) {
  const trimmed = value.replace(/\/+$/, '');
  if (trimmed.endsWith('/api/v1')) return trimmed;
  return `${trimmed}/api/v1`;
}

function normalizeBrowserChannel(value) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'installed') return 'auto';
  if (normalized === 'edge') return 'msedge';
  if (normalized === 'playwright' || normalized === 'chromium') return 'bundled';
  return normalized;
}

function resolveLocalPath(value) {
  if (path.isAbsolute(value)) return value;
  return path.join(packageRoot, value);
}

function parseBool(value) {
  return ['1', 'true', 'yes', 'y'].includes(value.toLowerCase());
}

function parsePositiveInt(value, key) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key}는 양수여야 합니다`);
  }
  return parsed;
}

function parseRegex(value, key) {
  try {
    return new RegExp(value, 'i');
  } catch (err) {
    throw new Error(`${key} 정규식이 올바르지 않습니다: ${err.message}`);
  }
}
