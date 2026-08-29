import { useNavigate } from "react-router-dom";
import { CircleUserRound, LogOut, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { useAuth } from "../../auth/useAuth";
import { roleLabel } from "../../lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../atoms/DropdownMenu";

export default function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus"
        >
          <CircleUserRound className="size-5 text-text-muted" aria-hidden="true" />
          <span className="max-w-40 truncate">{user.name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <span className="block truncate">{user.email}</span>
          <span className="block text-xs font-normal text-text-muted">
            {roleLabel(user.role)}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.role !== "student" && (
          <DropdownMenuItem onSelect={() => navigate("/me")}>
            <UserRound className="size-4" aria-hidden="true" />
            Minha conta
          </DropdownMenuItem>
        )}
        {(user.role === "admin" || user.role === "educator") && (
          <DropdownMenuItem onSelect={() => navigate("/admin/users")}>
            <UsersRound className="size-4" aria-hidden="true" />
            {user.role === "admin" ? "Gestão de usuários" : "Aprovações"}
          </DropdownMenuItem>
        )}
        {user.role === "admin" && (
          <DropdownMenuItem onSelect={() => navigate("/admin")}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            Auditoria
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={handleLogout}>
          <LogOut className="size-4" aria-hidden="true" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
