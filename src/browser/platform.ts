import type {PlatformApi, ImageInput} from './model';
export class BrowserPlatform implements PlatformApi {
  private urls = new Map<string, ReturnType<typeof setTimeout>>();
  chooseImage(): Promise<ImageInput | null> {
    return new Promise(resolve => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
      input.hidden = true; document.body.append(input);
      const finish = () => { const file = input.files?.[0]; input.remove(); resolve(file ? {file, name: file.name} : null); };
      input.addEventListener('change', finish, {once: true}); input.addEventListener('cancel', finish, {once: true}); input.click();
    });
  }
  downloadFile(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.hidden = true;
    document.body.append(anchor); anchor.click(); anchor.remove();
    const timer = setTimeout(() => { URL.revokeObjectURL(url); this.urls.delete(url); }, 30_000);
    this.urls.set(url, timer);
  }
  dispose() { for (const [url, timer] of this.urls) {clearTimeout(timer); URL.revokeObjectURL(url);} this.urls.clear(); }
}
