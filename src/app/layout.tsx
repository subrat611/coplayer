import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { RoomProvider } from "@/features/room/room-context";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "CoPlayer",
  description: "A shared listening experience.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full dark antialiased", "font-sans", inter.variable)}
    >
      <body className="min-h-full flex flex-col"><RoomProvider>{children}</RoomProvider></body>
    </html>
  );
}
