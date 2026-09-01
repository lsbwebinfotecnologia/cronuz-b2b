'use client';

import React from 'react';

export default function HorusDirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="w-full h-full flex flex-col">
      {children}
    </div>
  );
}
