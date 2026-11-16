import { useEffect } from "react";

export function useSelectInputText() {
  useEffect(() => {
    function selectText(event: Event) {
      const target = event.target;
      if (
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLInputElement &&
          ["text", "password", "search", "tel", "url", "email"].includes(target.type))
      ) {
        target.select();
      }
    }
    document.addEventListener("focusin", selectText);
    document.addEventListener("click", selectText);
    return () => {
      document.removeEventListener("focusin", selectText);
      document.removeEventListener("click", selectText);
    };
  }, []);
}
