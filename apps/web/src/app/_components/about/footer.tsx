import Link from "next/link";

export const Footer = () => {
  return (
    <footer className="bg-background border-t px-8">
      <div className="flex flex-col items-center justify-between gap-4 py-10 md:h-24 md:flex-row md:py-0">
        <div className="flex flex-row items-center gap-4">
          <Link
            className="text-sm underline hover:no-underline"
            target="_blank"
            rel="noopener noreferrer"
            href={
              "https://docs.google.com/forms/d/e/1FAIpQLSfLwbbr5i3d_lLJ8V2eSqqJ-GGQaEkQa_FehAQ_OCU8kBRQ5g/viewform?usp=pp_url&entry.1186430411=%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B%E5%86%85%E5%AE%B9%EF%BC%9AArsTraverse%E3%81%AB%E9%96%A2%E3%81%99%E3%82%8B%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B%0A--%E4%B8%8B%E8%A8%98%E3%81%AB%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B%E3%82%92%E3%81%94%E8%A8%98%E5%85%A5%E3%81%8F%E3%81%A0%E3%81%95%E3%81%84--%0A"
            }
          >
            お問い合わせ
          </Link>
          <Link
            href={"/"}
            className="text-sm underline hover:no-underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            ツールへ移動
          </Link>
        </div>
        <div className="text-muted-foreground text-center text-sm leading-loose md:text-left">
          © {new Date().getFullYear()} CariC. All rights reserved.
        </div>
      </div>
    </footer>
  );
};
