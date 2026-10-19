// Open during the click, before waiting for PostZen, so browsers keep user activation.
export async function openTikTokConnection(getUrl: () => Promise<{ authUrl: string }>) {
  const popup = window.open("about:blank", "_blank");
  if (popup) popup.opener = null;
  try {
    const { authUrl } = await getUrl();
    const url = new URL(authUrl);
    if (url.protocol !== "https:") throw new Error("Link de conexão inválido");
    if (popup && !popup.closed) popup.location.replace(url.href);
    else window.location.assign(url.href);
  } catch (error) {
    popup?.close();
    throw error;
  }
}