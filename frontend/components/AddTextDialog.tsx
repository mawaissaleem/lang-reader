"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import useStore from "@/store/useStore";
import { Plus, X } from "lucide-react";

export default function AddTextDialog() {
  const { setText } = useStore();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  function handleSubmit() {
    if (input.trim()) {
      setText(input.trim());
      setOpen(false);
      setInput("");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus size={16} />
          Add Text
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-xl shadow-2xl w-[90vw] max-w-2xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">
              Paste German Text
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="text-sm text-muted-foreground">
            Paste any German text below. Known words will be highlighted automatically.
          </Dialog.Description>

          <textarea
            className="w-full h-64 p-3 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            placeholder="Fügen Sie hier Ihren deutschen Text ein..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />

          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="px-4 py-2 text-sm rounded-lg border hover:bg-muted transition-colors">
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Load Text
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
