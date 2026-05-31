export const pageConfig = {
  publicLandingPages: ["/about", "/articles"],
  loginProhibitedPages: ["/about"],
};

export const spAllowed = (pagePath: string) =>
  pageConfig.publicLandingPages.some((publicPage) => {
    return pagePath.startsWith(publicPage);
  });

export const loginProhibited = (pagePath: string) => {
  return pageConfig.loginProhibitedPages.some((loginProhibitedPage) => {
    return pagePath.startsWith(loginProhibitedPage);
  });
};
