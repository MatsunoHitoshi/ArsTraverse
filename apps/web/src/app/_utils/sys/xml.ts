export const exportXML = (xml: string) => {
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
};
