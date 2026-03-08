import "./globals.css";

export const metadata = {
  title: "Backprop Practice",
  description: "A simple app for practicing backpropagation concepts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
