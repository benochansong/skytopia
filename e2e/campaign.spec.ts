import { test, expect } from '@playwright/test';
test('new campaign → dialogue pause → five blocks → stars → unlock → save and checkpoint restore', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '새 캠페인', exact: true }).click();
  await page.getByLabel('건축가 이름').fill('하늘 설계자');
  await page.getByRole('button', { name: '여정 시작' }).click();
  await page.getByRole('button', { name: '오프닝 건너뛰기' }).click();
  await expect(page.getByRole('dialog', { name: '엘레나 보스' })).toBeVisible();
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.elapsed)).toBe(0);
  await page.getByRole('button', { name: '다음 대사' }).click();
  await page.getByRole('button', { name: '설계 시작', exact: true }).click();
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [2, -1],
    [1, 0],
    [1, -3],
  ]) {
    await page.evaluate(([x, z]) => window.__SKYTOPIA_TEST__!.getState().aim({ x, z }), [x, z]);
    await page.locator('body').click({ position: { x: 10, y: 880 } });
    await page.keyboard.press('Space');
  }
  expect(
    await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.campaign!.placed),
  ).toBe(5);
  await page.evaluate(() => {
    const s = window.__SKYTOPIA_TEST__!;
    for (let i = 0; i < 35; i++) s.getState().tick(1);
  });
  await expect(page.getByRole('button', { name: '결과 보기 · 연출 건너뛰기' })).toBeVisible();
  await page.getByRole('button', { name: '결과 보기 · 연출 건너뛰기' }).click();
  await expect(page.getByRole('dialog', { name: '미션 완료' })).toBeVisible();
  await page.screenshot({ path: 'test-results/phase4-result.png' });
  const xp = await page.evaluate(
    () => window.__SKYTOPIA_TEST__!.getState().campaignSave.profile.xp,
  );
  expect(xp).toBeGreaterThan(0);
  await page.getByRole('button', { name: '다음 미션', exact: true }).click();
  await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await page.getByRole('button', { name: '체크포인트', exact: true }).click();
  await page.getByRole('button', { name: '기록·지도' }).click();
  await page.getByRole('button', { name: '체크포인트 불러오기', exact: true }).click();
  expect(
    await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.campaign!.checkpointUsed),
  ).toBe(true);
  await page.getByRole('button', { name: '기록·지도' }).click();
  await page.getByRole('button', { name: '캠페인 지도', exact: true }).click();
  await expect(page.getByRole('heading', { name: '하늘의 개척자' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/phase4-map.png' });
  await page.reload();
  await page.getByRole('button', { name: '캠페인 이어하기', exact: true }).click();
  await expect(page.locator('.campaign-objectives h1')).toHaveText('삶의 터전');
  expect(
    await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().campaignSave.profile.xp),
  ).toBe(xp);
  expect(errors).toEqual([]);
});
test('map locks, profile, challenges, locale and scene reentry remain usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '캠페인 지도', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.locator('.stage-strip button').nth(1).click();
  await expect(page.getByRole('button', { name: '이전 미션 완료 필요' })).toBeDisabled();
  await page.getByRole('button', { name: '메인 메뉴', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('skytopia.save.v5'))).toBeNull();
  await page.getByRole('button', { name: '건축가 프로필' }).click();
  await expect(page.getByRole('heading', { name: '도전 과제 · 0/34' })).toBeVisible();
  await page.getByRole('button', { name: '메인 메뉴', exact: true }).click();
  await page.getByRole('button', { name: '도전 모드', exact: true }).click();
  await page.getByRole('button', { name: '도전 시작', exact: true }).first().click();
  await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await expect(page.locator('.campaign-objectives')).toContainText('사용한 블록 0/6');
  await page.getByRole('button', { name: '기록·지도' }).click();
  await page.getByRole('button', { name: '캠페인 지도', exact: true }).click();
  await page.getByRole('button', { name: '메인 메뉴', exact: true }).click();
  await page.getByRole('button', { name: '한국어 / EN', exact: true }).click();
  await page.getByRole('button', { name: 'Campaign map', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pioneers of the sky' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('free build saves independently and resumes without changing campaign or legacy saves', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().startStage(1));
  await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await page.getByRole('button', { name: '기록·지도' }).click();
  await page.getByRole('button', { name: '메인 메뉴', exact: true }).click();
  const campaign = await page.evaluate(
    () => JSON.parse(localStorage.getItem('skytopia.campaign.v3')!).current,
  );
  await page.getByRole('button', { name: '자유 건설', exact: true }).click();
  await expect(page.locator('.mission-card h1')).toHaveText('자유 건설');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '저장 후 메뉴', exact: true }).click();
  const free = await page.evaluate(
    () => JSON.parse(localStorage.getItem('skytopia.campaign.v3')!).free,
  );
  expect(free.city.unlimited).toBe(false);
  expect(free.campaign).toBeUndefined();
  await page.reload();
  await page.getByRole('button', { name: '자유 건설 이어하기', exact: true }).click();
  await expect(page.locator('.mission-card h1')).toHaveText('자유 건설');
  expect(
    await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.platforms.length),
  ).toBe(free.platforms.length);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('skytopia.campaign.v3')!).current),
  ).toEqual(campaign);
  expect(await page.evaluate(() => localStorage.getItem('skytopia.save.v5'))).toBeNull();
});

test('corrupt profile remains untouched by free saves and opening replay until explicit reset', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('skytopia.campaign.v3', '{bad'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('손상된 저장');
  await page.getByRole('button', { name: '자유 건설', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '저장 후 메뉴', exact: true }).click();
  await page.evaluate(() => {
    window.__SKYTOPIA_TEST__!.getState().replayOpening();
    window.__SKYTOPIA_TEST__!.getState().finishOpening();
  });
  expect(await page.evaluate(() => localStorage.getItem('skytopia.campaign.v3'))).toBe('{bad');
  await page.getByRole('button', { name: '새 캠페인', exact: true }).click();
  await page.getByRole('button', { name: '여정 시작' }).click();
  await page.getByRole('button', { name: '오프닝 건너뛰기' }).click();
  await expect(page.getByRole('dialog', { name: '엘레나 보스' })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('skytopia.campaign.v3')!).current.campaign.stage,
    ),
  ).toBe(1);
});
