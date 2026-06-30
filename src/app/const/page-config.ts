import { routing } from "i18n/routing";

export const pageConfig = {
  publicLandingPages: ["/about", "/articles", "/field"],
  loginProhibitedPages: ["/about"],
};

/** Strip locale prefix from pathname for route matching */
export function stripLocalePrefix(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) {
      return "/";
    }
    if (pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(locale.length + 1);
    }
  }
  return pathname;
}

export const spAllowed = (pagePath: string) => {
  const path = stripLocalePrefix(pagePath);
  return pageConfig.publicLandingPages.some((publicPage) => {
    return path.startsWith(publicPage);
  });
};

export const loginProhibited = (pagePath: string) => {
  const path = stripLocalePrefix(pagePath);
  return pageConfig.loginProhibitedPages.some((loginProhibitedPage) => {
    return path.startsWith(loginProhibitedPage);
  });
};
