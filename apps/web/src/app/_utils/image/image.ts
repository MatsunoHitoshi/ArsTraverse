const checkIsStringBase64: (string: string) => boolean = (string) => {
  // Base64データURLの正しい形式: data:[<mediatype>][;base64],<data>
  if (!string.startsWith("data:")) {
    return false;
  }

  // ;base64, が含まれているかチェック
  const base64Index = string.indexOf(";base64,");
  if (base64Index === -1) {
    return false;
  }

  // データ部分を取得（;base64, の後）
  const dataPart = string.substring(base64Index + 8); // ";base64," は8文字

  // データ部分が空でないことを確認
  if (dataPart.length === 0) {
    return false;
  }

  // Base64文字のみで構成されているかチェック（A-Z, a-z, 0-9, +, /, =）
  // 末尾の=はパディングなので、0〜2個まで許可
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  return base64Regex.test(dataPart);
};

const getBase64FromUrl = async (url: string): Promise<string> => {
  if (checkIsStringBase64(url)) {
    return url;
  }

  const data = await fetch(url);
  const blob = await data.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
      const base64data = reader.result;
      resolve(base64data as string);
    };
  });
};

const getBase64ListFromUrl: (images: string[]) => Promise<string[]> = async (
  images,
) => {
  return Promise.all(
    images.map(async (image) => {
      const base64 = await getBase64FromUrl(image);
      return base64;
    }),
  );
};

export { getBase64ListFromUrl };
