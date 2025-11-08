import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'GLB to VRM Converter',
  description: 'Headless Blender-based GLB to VRM converter service',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
