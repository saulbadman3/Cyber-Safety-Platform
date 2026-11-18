import { expect, test } from "@playwright/test";

test("реєстрація → анкета → результат → збитки → план → звіт", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Пройти анкету" }).first().click();

  await expect(page).toHaveURL(/\/register\?/);
  await page.locator("#email").fill(`pilot-${Date.now()}@example.test`);
  await page.locator("#password").fill("secure-pilot-pass-123");
  await page.getByRole("button", { name: "Зареєструватися" }).click();

  await expect(page).toHaveURL((url) => url.pathname === "/assessment");
  await page.locator("#company_name").fill("Майстерня Пілот");
  await page.locator("#sector").fill("Послуги");
  await page.getByRole("button", { name: "Почати запитання" }).click();

  const progress = page.getByRole("progressbar");
  for (let question = 1; question <= 14; question += 1) {
    await expect(progress).toHaveAttribute("aria-valuenow", String(question));
    await page.getByRole("button", { name: "Ні" }).click();
    await page.getByRole("button", { name: question === 14 ? "Завершити анкету" : "Далі" }).click();
  }

  await expect(page).toHaveURL(/\/results\/\d+$/);
  await expect(page.getByText("Рівень ризику")).toBeVisible();
  await page.getByRole("link", { name: "Збитки" }).click();
  await expect(page).toHaveURL(/\/losses\/\d+$/);
  await expect(page.getByText("Топ-збитки за сценаріями")).toBeVisible();
  await page.getByRole("link", { name: "План дій" }).last().click();
  await expect(page).toHaveURL(/\/action-plan\/\d+$/);
  await expect(page.getByRole("heading", { name: "План дій" })).toBeVisible();
  await page.getByRole("link", { name: "Звіт" }).click();
  await expect(page).toHaveURL(/\/report\/\d+$/);
  await expect(page.getByRole("heading", { name: "Звіт з кібербезпеки" })).toBeVisible();
  await expect(page.getByText("Майстерня Пілот")).toBeVisible();
});
