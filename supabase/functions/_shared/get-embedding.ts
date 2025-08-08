import { HfInference } from "npm:@huggingface/inference";

const hf = new HfInference(Deno.env.get("HUGGINGFACE_API_KEY"));

export const getEmbedding = async (text: string): Promise<number[]> => {
  try {
    const response = await hf.featureExtraction({
      model: "sentence-transformers/all-MiniLM-L6-v2",
      inputs: text,
    });
    return Array.from(response);
  } catch (error) {
    console.error("Error getting embedding:", error);
    throw error;
  }
};
