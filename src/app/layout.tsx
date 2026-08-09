import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 理專助理',
  description: '理財專員的 AI 客戶關係管理助理',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // 主題預設淺色（與原型一致），由 AppShell 的切換鈕在 <html> 上加／移除 .dark
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
