import "./globals.css";

export const metadata = {
  title: "The Woodworking Guy - Tell Me About Your Build!",
  description: "Tell The Woodworking Guy about the project you just built.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Same font pairing as thewoodworkingguy's website: Fredoka for
            headings, Inter for body copy. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
