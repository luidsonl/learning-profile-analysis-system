import { Link } from "react-router-dom";
import Button from "../components/atoms/Button";

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h1 className="text-5xl font-bold text-primary">404</h1>
      <p className="mt-2 text-lg text-text">Página não encontrada.</p>
      <p className="mt-1 text-text-muted">O endereço que você acessou não existe ou foi movido.</p>
      <Link to="/" className="mt-6">
        <Button variant="secondary">Voltar ao início</Button>
      </Link>
    </div>
  );
}
