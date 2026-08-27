import { Toaster as SonnerToaster } from "sonner";

// Mapped to design tokens; sonner uses role="status" for success and
// role="alert" for errors, with auto-dismiss + manual close. (design-system.md)
export default function Toaster() {
  return (
    <SonnerToaster
      richColors
      closeButton
      position="top-center"
      toastOptions={{
        style: {
          fontFamily: "var(--font-sans)",
          fontSize: "15px",
          borderRadius: "10px",
        },
      }}
    />
  );
}
