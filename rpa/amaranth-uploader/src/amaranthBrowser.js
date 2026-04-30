import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

export async function openLoginBrowser(config) {
  const context = await launchContext(config);
  const page = context.pages()[0] || await context.newPage();
  await page.goto(config.amaranthUploadURL, { waitUntil: 'domcontentloaded', timeout: config.timeoutMs });
  return { context, page };
}

export async function uploadOutboundExcel(config, job, filePath) {
  const context = await launchContext(config);
  const page = context.pages()[0] || await context.newPage();

  try {
    await page.goto(config.amaranthUploadURL, { waitUntil: 'domcontentloaded', timeout: config.timeoutMs });
    await waitForSettled(page);
    await ensureLoggedIn(page, config);
    await assertUploadScreen(page, config);

    await clickByText(page, config.featureMenuRegex, 'MENU_NOT_FOUND', '기능모음', config.timeoutMs);
    await waitForSettled(page);
    await chooseUploadFile(page, config, filePath);
    await waitForSettled(page);
    await clickByText(page, config.convertConfirmRegex, 'CONVERT_CONFIRM_FAILED', '변환확인', config.timeoutMs);
    await waitForSettled(page);

    const result = await readResult(page, config);
    if (result.status === 'manual_required') {
      result.artifactPath = await captureArtifact(page, config, job.job_id, 'manual_required');
    }
    return result;
  } catch (err) {
    if (!err.artifactPath) {
      err.artifactPath = await captureArtifact(page, config, job.job_id, err.code || 'error').catch(() => '');
    }
    throw err;
  } finally {
    await context.close();
  }
}

async function launchContext(config) {
  fs.mkdirSync(config.userDataDir, { recursive: true });

  const baseOptions = {
    acceptDownloads: true,
    headless: config.headless,
    viewport: { width: 1440, height: 950 },
  };

  let lastError;
  for (const channel of browserChannelCandidates(config.browserChannel)) {
    const options = { ...baseOptions };
    if (channel !== 'bundled') {
      options.channel = channel;
    }

    try {
      return await chromium.launchPersistentContext(config.userDataDir, options);
    } catch (err) {
      lastError = err;
      if (!isMissingBrowserError(err)) {
        throw err;
      }
    }
  }

  throw automationError(
    'BROWSER_NOT_FOUND',
    `설치된 Chrome 또는 Edge를 찾지 못했습니다: ${lastError?.message || 'browser not found'}`,
    'failed',
  );
}

function browserChannelCandidates(channel) {
  if (!channel || channel === 'auto') {
    return ['chrome', 'msedge'];
  }
  return [channel];
}

function isMissingBrowserError(err) {
  return /browser.*not found|distribution.*not found|executable doesn't exist|cannot find/i.test(err?.message || '');
}

async function assertUploadScreen(page, config) {
  const bodyText = await readAllText(page, 5000);
  if (config.loginRequiredRegex.test(bodyText) && !config.pageReadyRegex.test(bodyText)) {
    throw automationError('LOGIN_REQUIRED', '아마란스 로그인 세션이 필요합니다', 'manual_required');
  }
  if (!config.pageReadyRegex.test(bodyText)) {
    throw automationError('SCREEN_NOT_READY', '출고등록엑셀업로드 화면을 확인하지 못했습니다', 'manual_required');
  }
}

async function ensureLoggedIn(page, config) {
  const bodyText = await readAllText(page, 5000);
  if (!config.loginRequiredRegex.test(bodyText) || config.pageReadyRegex.test(bodyText)) {
    return;
  }
  if (!config.autoLogin) {
    return;
  }

  await performAutoLogin(page, config);
  await waitForSettled(page);
  await page.goto(config.amaranthUploadURL, { waitUntil: 'domcontentloaded', timeout: config.timeoutMs });
  await waitForSettled(page);
}

async function performAutoLogin(page, config) {
  await fillCompanyCodeIfNeeded(page, config);
  await fillLoginID(page, config);

  if (!(await hasVisiblePasswordInput(page))) {
    await clickByText(page, config.loginNextRegex, 'LOGIN_NEXT_NOT_FOUND', '로그인 다음', config.timeoutMs);
    await waitForSettled(page);
  }

  await fillPassword(page, config);
  await clickLoginSubmit(page, config);
  await waitForSettled(page);

  const bodyText = await readAllText(page, 5000);
  if (config.loginRequiredRegex.test(bodyText) && !config.pageReadyRegex.test(bodyText)) {
    throw automationError('LOGIN_FAILED', '아마란스 자동 로그인 후에도 로그인 화면입니다', 'manual_required');
  }
}

async function fillCompanyCodeIfNeeded(page, config) {
  if (!config.companyCode) {
    return;
  }

  for (const root of roots(page)) {
    if (await fillFirstVisible(root, [
      'input[placeholder*="회사"]',
      'input[placeholder*="회사코드"]',
      'input[placeholder*="기업"]',
      'input[placeholder*="그룹"]',
    ], config.companyCode)) {
      return;
    }

    const textInputs = await visibleTextInputs(root);
    if (textInputs.length >= 2) {
      await textInputs[0].fill(config.companyCode, { timeout: 5000 });
      return;
    }
  }
}

async function fillLoginID(page, config) {
  for (const root of roots(page)) {
    if (await fillFirstVisible(root, [
      'input[placeholder*="아이디"]',
      'input[placeholder*="ID"]',
      'input[name*="id" i]',
      'input[id*="id" i]',
    ], config.loginUserID)) {
      return;
    }

    const textInputs = await visibleTextInputs(root);
    if (textInputs.length >= 2 && config.companyCode) {
      await textInputs[1].fill(config.loginUserID, { timeout: 5000 });
      return;
    }
    if (textInputs.length >= 1) {
      await textInputs[0].fill(config.loginUserID, { timeout: 5000 });
      return;
    }
  }

  throw automationError('LOGIN_ID_INPUT_NOT_FOUND', '아마란스 아이디 입력칸을 찾지 못했습니다', 'manual_required');
}

async function fillPassword(page, config) {
  for (const root of roots(page)) {
    if (await fillFirstVisible(root, [
      'input[type="password"]',
      'input[placeholder*="비밀번호"]',
      'input[name*="password" i]',
      'input[id*="password" i]',
      'input[name*="pwd" i]',
      'input[id*="pwd" i]',
    ], config.loginPassword)) {
      return;
    }
  }

  throw automationError('LOGIN_PASSWORD_INPUT_NOT_FOUND', '아마란스 비밀번호 입력칸을 찾지 못했습니다', 'manual_required');
}

async function clickLoginSubmit(page, config) {
  try {
    await clickByText(page, config.loginSubmitRegex, 'LOGIN_SUBMIT_NOT_FOUND', '로그인', 5000);
    return;
  } catch (err) {
    if (err.code !== 'LOGIN_SUBMIT_NOT_FOUND') {
      throw err;
    }
  }
  await clickByText(page, config.loginNextRegex, 'LOGIN_SUBMIT_NOT_FOUND', '로그인 제출', config.timeoutMs);
}

async function hasVisiblePasswordInput(page) {
  for (const root of roots(page)) {
    const input = root.locator('input[type="password"]');
    const count = await input.count();
    for (let i = 0; i < count; i += 1) {
      if (await input.nth(i).isVisible().catch(() => false)) {
        return true;
      }
    }
  }
  return false;
}

async function fillFirstVisible(root, selectors, value) {
  for (const selector of selectors) {
    const input = root.locator(selector);
    const count = await input.count().catch(() => 0);
    for (let i = 0; i < count; i += 1) {
      const candidate = input.nth(i);
      if ((await candidate.isVisible().catch(() => false)) && (await candidate.isEnabled().catch(() => false))) {
        await candidate.fill(value, { timeout: 5000 });
        return true;
      }
    }
  }
  return false;
}

async function visibleTextInputs(root) {
  const input = root.locator('input:not([type="hidden"]):not([type="password"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])');
  const count = await input.count().catch(() => 0);
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const candidate = input.nth(i);
    if ((await candidate.isVisible().catch(() => false)) && (await candidate.isEnabled().catch(() => false))) {
      result.push(candidate);
    }
  }
  return result;
}

async function chooseUploadFile(page, config, filePath) {
  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: config.fileChooserTimeoutMs }).catch(() => null);

  await clickByText(page, config.uploadMenuRegex, 'MENU_NOT_FOUND', '엑셀 업로드', config.timeoutMs);

  const fileChooser = await fileChooserPromise;
  if (fileChooser) {
    await fileChooser.setFiles(filePath);
    return;
  }

  for (const root of roots(page)) {
    const input = root.locator('input[type="file"]').last();
    if ((await input.count()) === 0) continue;
    await input.setInputFiles(filePath);
    return;
  }

  throw automationError('FILE_CHOOSER_FAILED', '파일 선택창 또는 파일 입력을 찾지 못했습니다', 'manual_required');
}

async function readResult(page, config) {
  const bodyText = await readAllText(page, 8000);
  const failure = bodyText.match(config.failureRegex);
  if (failure) {
    throw automationError('UPLOAD_FAILED', `아마란스 오류 문구 감지: ${failure[0]}`, 'manual_required');
  }

  const success = bodyText.match(config.successRegex);
  if (success) {
    return {
      status: 'uploaded',
      message: `아마란스 업로드 완료 문구 감지: ${success[0]}`,
    };
  }

  return {
    status: 'manual_required',
    message: '변환확인까지 실행했지만 성공 문구를 확인하지 못했습니다',
  };
}

async function clickByText(page, regex, code, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    for (const root of roots(page)) {
      const locators = [
        root.getByRole('button', { name: regex }).first(),
        root.getByRole('menuitem', { name: regex }).first(),
        root.getByText(regex).first(),
        root.locator('button, [role="button"], [role="menuitem"], a, li, span, div').filter({ hasText: regex }).first(),
      ];

      for (const locator of locators) {
        try {
          await locator.waitFor({ state: 'visible', timeout: 800 });
          await locator.click({ timeout: 3000 });
          return;
        } catch (err) {
          lastError = err;
        }
      }
    }
    await page.waitForTimeout(500);
  }

  throw automationError(code, `${label} 버튼/메뉴를 찾지 못했습니다: ${lastError?.message || 'not found'}`, 'manual_required');
}

function roots(page) {
  return [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
}

async function readAllText(page, timeoutMs) {
  const texts = [];
  for (const root of roots(page)) {
    try {
      texts.push(await root.locator('body').innerText({ timeout: timeoutMs }));
    } catch {
      // 다른 출처 iframe은 본문을 읽지 못할 수 있다. 클릭 후보는 별도로 계속 찾는다.
    }
  }
  return texts.join('\n');
}

async function waitForSettled(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function captureArtifact(page, config, jobID, suffix) {
  fs.mkdirSync(config.artifactDir, { recursive: true });
  const safeSuffix = String(suffix).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const filePath = path.join(config.artifactDir, `${jobID}_${safeSuffix}_${Date.now()}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

function automationError(code, message, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}
