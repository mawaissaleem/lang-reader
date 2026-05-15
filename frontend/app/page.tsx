"use client";
import { useState, useEffect } from "react";
import AddTextDialog from "@/components/AddTextDialog";
import TextDisplay from "@/components/TextDisplay";
import SidePanel from "@/components/SidePanel";
import useStore from "@/store/useStore";
import { BookOpen } from "lucide-react";

const USER_ID = 1;

export default function Home() {
  const { text } = useStore();
  const loadUserWords = useStore(s => s.loadUserWords);

  useEffect(() => {
    loadUserWords(USER_ID);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#0d0d0f]">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between bg-[#0d0d0f]">
        <div className="flex items-center gap-2">
          <BookOpen className="text-blue-400" size={20} />
          <h1 className="text-[15px] font-semibold tracking-tight text-white/80">
            German Reader
          </h1>
        </div>
        <AddTextDialog />
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Text area */}
        <main className="flex-1 overflow-y-auto p-8">
          {!text ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 mt-24">
              <BookOpen size={48} className="text-white/10" />
              <p className="text-[15px] font-medium text-white/30">No text loaded yet</p>
              <p className="text-[13px] text-white/20">
                Click "Add Text" to paste German text and start reading
              </p>
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
