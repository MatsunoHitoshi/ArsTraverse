import ogs from "open-graph-scraper";

export async function getOgp(url: string) {
  try {
    const { result } = await ogs({ url });
    return result;
  } catch (error) {
    console.error("Error fetching OGP:", error);
    return null;
  }
}
