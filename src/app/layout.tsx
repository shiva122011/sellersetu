import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SellerSetu — Any Service. One Platform. A Quote Built for You.",
  description:
    "Universal service marketplace for Indian businesses: websites & software, design, marketplace listings, AI & automation, compliance, manufacturing, marketing and more. Customized quotations, in-house or managed vendor execution, direct vendor connections — all tracked in one workspace.",
  keywords: [
    "service marketplace", "custom quotation", "website development", "product listing services",
    "business registration", "AI automation", "vendor connection", "project management", "India",
  ],
  icons: {
    icon: "/logos/sellersetu-mark.png",
  },
  openGraph: {
    title: "SellerSetu — Any Service. One Platform. A Quote Built for You.",
    description: "From requirement to quotation to delivery — track milestones, documents, payments and chat in one secure workspace.",
    siteName: "SellerSetu",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
