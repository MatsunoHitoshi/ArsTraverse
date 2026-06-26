import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { TopGraph } from "./top-graph";

import { OgpScraper } from "../ogp/ogp-scraper";
import { FadeIn } from "../animation/fade-in";
import { Footer } from "./footer";
import { Link } from "i18n/navigation";

const CONTACT_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfLwbbr5i3d_lLJ8V2eSqqJ-GGQaEkQa_FehAQ_OCU8kBRQ5g/viewform?usp=pp_url&entry.1186430411=%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B%E5%86%85%E5%AE%B9%EF%BC%9AArsTraverse%E3%81%AB%E9%96%A2%E3%81%99%E3%82%8B%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B%0A--%E4%B8%8B%E8%A8%98%E3%81%AB%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B%E3%82%92%E3%81%94%E8%A8%98%E5%85%A5%E3%81%8F%E3%81%A0%E3%81%95%E3%81%84--%0A";

const highlight = (chunks: React.ReactNode) => (
  <span className="text-orange-400">{chunks}</span>
);

const kgHighlight = (chunks: React.ReactNode) => (
  <span className="text-orange-400">{chunks}</span>
);

export const About = async () => {
  const t = await getTranslations("about");

  return (
    <div className="flex w-full flex-col text-white">
      <div className="absolute top-0 z-0 w-full opacity-45">
        <div className="hidden sm:block">
          <TopGraph height={252 + 64} />
        </div>
        <div className="block sm:hidden">
          <TopGraph height={232 + 64} />
        </div>
      </div>
      <div className="relative z-10 flex w-full flex-col items-center gap-2 py-20">
        <h1 className="text-4xl font-bold sm:text-6xl">ArsTraverse</h1>
        <p>{t("tagline")}</p>
      </div>

      <div className="mx-auto flex w-full max-w-[960px] flex-col">
        <Section>
          <h2 className="text-2xl font-bold lg:text-3xl">{t("missionTitle")}</h2>
          <p className="container">{t("missionBody")}</p>

          <LinkButton href="/">{t("tryButton")}</LinkButton>
        </Section>

        <Section className="bg-black/20">
          <h2 className="text-2xl font-bold lg:text-3xl">{t("kgTitle")}</h2>

          <div className="flex flex-col gap-8 md:flex-row">
            <div className="flex flex-col gap-4">
              <p className="container">
                {t.rich("kgBody1", {
                  artistA: kgHighlight,
                  workX: kgHighlight,
                  created: kgHighlight,
                  relation: kgHighlight,
                })}
              </p>
              <div className="flex flex-col items-center md:hidden">
                <Image
                  src="/images/about/knowledge-graph.png"
                  alt={t("kgImageAlt")}
                  className="max-w-52"
                  width={1000}
                  height={1000}
                />
              </div>
              <p className="container">{t("kgBody2")}</p>
            </div>
            <div className="hidden flex-col items-center md:flex">
              <Image
                src="/images/about/knowledge-graph.png"
                alt={t("kgImageAlt")}
                className="max-w-52"
                width={1000}
                height={1000}
              />
            </div>
          </div>
        </Section>

        <Section className="">
          <div className="divide-y divide-gray-700">
            <SubSection>
              <div className="flex flex-col gap-8">
                <h2 className="text-center text-2xl font-bold lg:text-3xl">
                  {t("featuresTitle")}
                </h2>
                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                  <MainDescription title={t("featureAutoBuildTitle")}>
                    <div>{t("featureAutoBuildBody")}</div>
                    <Image
                      src="/images/about/arstraverse-upload-dnd.gif"
                      alt={t("featureAutoBuildAlt")}
                      width={1080}
                      height={1080}
                    />
                  </MainDescription>
                  <MainDescription title={t("featureFilterTitle")}>
                    <div>{t("featureFilterBody")}</div>
                    <Image
                      src="/images/about/arstraverse-filter-and-guide.gif"
                      alt={t("featureFilterAlt")}
                      width={1080}
                      height={1080}
                    />
                  </MainDescription>
                  <MainDescription
                    title={t("featureEditTitle")}
                    developing
                    developingLabel={t("developing")}
                  >
                    <div>{t("featureEditBody")}</div>
                    <Image
                      src="/images/about/graph-editor.png"
                      alt={t("featureEditAlt")}
                      width={1000}
                      height={1000}
                    />
                  </MainDescription>
                  <MainDescription
                    title={t("featureCommunityTitle")}
                    developing
                    developingLabel={t("developing")}
                  >
                    <div>{t("featureCommunityBody")}</div>
                    <Image
                      src="/images/about/data-repository.png"
                      alt={t("featureCommunityAlt")}
                      width={1000}
                      height={1000}
                    />
                  </MainDescription>
                </div>
              </div>
            </SubSection>

            <SubSection>
              <div className="flex flex-col gap-8">
                <h2 className="text-center text-2xl font-bold lg:text-3xl">
                  {t("useCasesTitle")}
                </h2>

                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                    <MainDescription title={t("useCaseExhibitionTitle")}>
                      <div>{t("useCaseExhibitionBody")}</div>
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-col items-start gap-1">
                          <div className="mt-1 flex h-6 w-max min-w-[64px] items-center justify-center rounded-full bg-orange-500 px-2 text-xs text-slate-900">
                            {t("exhibitionExample")}
                          </div>
                          <a
                            className="text-base font-bold underline hover:no-underline"
                            target="_blank"
                            rel="noopener noreferrer"
                            href="https://www.museum-library-uki.jp/museum/project/2025/03/905/"
                          >
                            {t("exhibitionLinkTitle")}
                          </a>
                        </div>
                        <Image
                          src="/images/about/hataraki-and-kyushu-ha.png"
                          alt={t("exhibitionImageAlt")}
                          width={1080}
                          height={1080}
                        />
                        <div className="text-xs">{t("exhibitionCaption")}</div>
                      </div>
                      <LinkButton href={CONTACT_FORM_URL}>
                        {t("customizeConsultation")}
                      </LinkButton>
                    </MainDescription>

                    <div className="flex flex-col gap-6">
                      <MainDescription title={t("useCaseResearchTitle")}>
                        <div>{t("useCaseResearchBody")}</div>
                      </MainDescription>

                      <MainDescription title={t("useCaseArchiveTitle")}>
                        <div>{t("useCaseArchiveBody")}</div>
                      </MainDescription>
                    </div>
                  </div>
                </div>
              </div>
            </SubSection>

            <SubSection>
              <div className="flex flex-col gap-8">
                <h2 className="text-center text-2xl font-bold lg:text-3xl">
                  {t("visionTitle")}
                </h2>

                <MainDescription title={t("whyDevelopTitle")}>
                  <div className="flex flex-col gap-4 text-base">
                    <p>{t.rich("whyDevelopP1", { highlight })}</p>
                    <p>{t("whyDevelopP2")}</p>
                    <p>{t("whyDevelopP3")}</p>
                    <div className="px-6 text-orange-400">
                      <ul className="list-disc">
                        <li>{t("whyDevelopChallenge1")}</li>
                        <li>{t("whyDevelopChallenge2")}</li>
                        <li>{t("whyDevelopChallenge3")}</li>
                      </ul>
                    </div>
                    <p>{t("whyDevelopP4")}</p>
                    <p className="font-bold text-orange-400">
                      {t("whyDevelopP5")}
                    </p>
                  </div>
                </MainDescription>
                <MainDescription title={t("goalTitle")}>
                  <div className="flex flex-col gap-4 text-base">
                    <p>{t("goalP1")}</p>
                    <p>{t.rich("goalP2", { highlight })}</p>
                    <p className="text-xs">{t("goalFootnote")}</p>
                  </div>
                </MainDescription>
                <MainDescription title={t("developerTitle")}>
                  <div className="flex flex-col items-center">
                    <OgpScraper url="https://matsuno.caric.jp" />
                  </div>
                </MainDescription>
              </div>
            </SubSection>
          </div>
        </Section>
      </div>

      <Footer />
    </div>
  );
};

const Section = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <FadeIn>
      <div
        className={`flex w-full flex-col gap-4 px-4 py-8 sm:px-8 sm:py-12 ${className}`}
      >
        {children}
      </div>
    </FadeIn>
  );
};

const SubSection = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <FadeIn>
      <div className={`flex w-full flex-col py-10 ${className}`}>
        {children}
      </div>
    </FadeIn>
  );
};

const MainDescription = ({
  children,
  title,
  developing,
  developingLabel,
}: {
  children: React.ReactNode;
  title: string;
  developing?: boolean;
  developingLabel?: string;
}) => {
  return (
    <FadeIn>
      <div className="flex flex-col gap-3">
        <div className="flex flex-row items-center gap-2 sm:justify-center">
          {developing && developingLabel && (
            <div className="flex h-6 min-w-[58px] items-center justify-center rounded-full bg-orange-500 px-2 text-sm text-slate-900">
              {developingLabel}
            </div>
          )}
          <h3 className="text-xl font-bold">{title}</h3>
        </div>

        <div className="flex flex-col gap-3 text-sm">{children}</div>
      </div>
    </FadeIn>
  );
};

const LinkButton = ({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) => {
  const className =
    "flex w-max flex-row items-center justify-center rounded-full bg-orange-500 px-4 py-2 text-slate-900 duration-200 hover:bg-orange-400";
  const isInternal = href.startsWith("/") || href.startsWith("#");

  if (!isInternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
};
