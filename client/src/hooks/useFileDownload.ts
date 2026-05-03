export function useFileDownload() {
  const download = (conversationId: string, fileId: string, filename: string) => {
    const url = `/api/conversations/${conversationId}/downloads/${fileId}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };
  return { download };
}
