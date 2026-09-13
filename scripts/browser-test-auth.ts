type TestRole = "USER" | "ADMIN";

type TestRequest = {
  post(url: string, options: { data: { role: TestRole } }): Promise<{
    ok(): boolean;
    text(): Promise<string>;
  }>;
};

type BrowserPage = {
  context(): { request: TestRequest };
  goto(url: string): Promise<unknown>;
};

async function loginAs(page: BrowserPage, role: TestRole, baseUrl = ""): Promise<void> {
  const response = await page.context().request.post(`${baseUrl}/api/test-auth/login`, { data: { role } });
  if (!response.ok()) {
    throw new Error(`Test Auth login failed for ${role}: ${await response.text()}`);
  }
}

export function loginAsTestUser(page: BrowserPage, baseUrl = ""): Promise<void> {
  return loginAs(page, "USER", baseUrl);
}

export function loginAsTestAdmin(page: BrowserPage, baseUrl = ""): Promise<void> {
  return loginAs(page, "ADMIN", baseUrl);
}