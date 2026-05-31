import { getOgp } from "@/app/_utils/ogp/ogp-scraper";
import Image from "next/image";
import Link from "next/link";

export const OgpScraper = async ({ url }: { url: string }) => {
  const ogp = await getOgp(url);
  return (
    <Link href={url} target="_blank" rel="noopener noreferrer">
      {ogp && (
        <div className="flex flex-col items-center justify-center gap-6 rounded-2xl bg-black/40 p-8 transition-all duration-300 hover:bg-white/10 md:w-max md:flex-row">
          {ogp?.ogImage && ogp?.ogImage.length > 0 && (
            <Image
              src={ogp?.ogImage[0]?.url ?? ""}
              alt={ogp?.ogImage[0]?.alt ?? "OGP Image"}
              className="mb-2 h-auto w-48 rounded-full"
              width={500}
              height={500}
            />
          )}
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">
              {ogp?.ogTitle ?? "No Title"}
            </h2>

            <div className="max-w-xl">{ogp?.ogDescription}</div>
          </div>
        </div>
      )}
    </Link>
  );
};
