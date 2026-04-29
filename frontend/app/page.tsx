"use client";

import { useState } from "react";
import AddTextDialog from "@/components/AddTextDialog";
import TextDisplay from "@/components/TextDisplay";
import SidePanel from "@/components/SidePanel";
import useStore from "@/store/useStore";
import { BookOpen } from "lucide-react";

export default function Home() {
  const { text } = useStore();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between bg-white shadow-sm">
        <div className="flex items-center gap-2">
          <BookOpen className="text-blue-600" size={22} />
          <h1 className="text-lg font-semibold tracking-tight">German Reader</h1>
        </div>
        <AddTextDialog />
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Text area */}
        <main className="flex-1 overflow-y-auto p-8">
          {!text ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3 mt-24">
              <BookOpen size={48} className="opacity-20" />
              <p className="text-lg font-medium">No text loaded yet</p>
              <p className="text-sm">Click "Add Text" to paste German text and start reading</p>
            </div>
          ) : (
            <TextDisplay />
          )}
        </main>

        {/* Side panel */}
        <SidePanel />
      </div>
    </div>
  );
}
