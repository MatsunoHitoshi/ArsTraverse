export const exportSvg = (svgElement: SVGSVGElement, scale: number) => {
  const svgData = new XMLSerializer().serializeToString(svgElement);
  console.log(svgData);
  const svgBlob = new Blob([svgData], {
    type: "image/svg+xml;charset=utf-8",
  });
  const svgUrl = URL.createObjectURL(svgBlob);
  console.log("svg: ", svgBlob);

  const canvas = document.createElement("canvas");
  canvas.width = svgElement.clientWidth * scale;
  canvas.height = svgElement.clientHeight * scale;
  canvas.style.backgroundColor = "#0F172A";
  const ctx = canvas.getContext("2d");
  const img = new Image();
  img.onload = () => {
    ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(svgUrl);
    const imageUrl = canvas.toDataURL(`image/png`);
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `exported-graph-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  img.src = svgUrl;
};

export const exportTxt = (url: string, name: string) => {
  fetch(url)
    .then((response) => response.blob())
    .then((blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    })
    .catch((e) => {
      console.log("error: ", e);
    });
};
