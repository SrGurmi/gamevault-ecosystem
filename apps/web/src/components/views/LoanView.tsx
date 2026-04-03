import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { img } from "../../lib/helpers";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import type { Loan } from "../../types";

interface LoanViewProps {
  loans: Loan[];
  loading: boolean;
  onReturn: (loanId: string) => void;
}

export function LoanView({ loans, loading, onReturn }: LoanViewProps) {
  const [returning, setReturning] = useState<string | null>(null);

  const handleReturn = async (loanId: string) => {
    setReturning(loanId);
    await supabase
      .from("loans")
      .update({
        return_date: new Date().toISOString(),
        status: "returned",
        updated_at: new Date().toISOString(),
      })
      .eq("id", loanId);
    onReturn(loanId);
    setReturning(null);
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner label="Cargando préstamos…" />
      </div>
    );

  const active = loans.filter((l) => !l.return_date);
  const returned = loans.filter((l) => l.return_date);

  const LoanRow = ({ loan }: { loan: Loan }) => {
    const overdue =
      !loan.return_date &&
      loan.due_date &&
      new Date(loan.due_date) < new Date();
    return (
      <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-emerald-500/30 transition-all group">
        <img
          src={img(loan.inventory_items?.games?.cover_url)}
          className="w-10 h-14 object-cover rounded-lg shrink-0"
          alt=""
        />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm truncate">
            {loan.inventory_items?.games?.title || "Unknown"}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Prestado a{" "}
            <span className="text-slate-300">{loan.profiles?.full_name}</span>
          </p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-[10px] text-slate-500">
              <Icon name="calendar" className="w-3 h-3" />
              {new Date(loan.loan_date).toLocaleDateString("es-ES")}
            </span>
            {loan.due_date && (
              <span
                className={`text-[10px] font-bold ${overdue ? "text-red-400" : "text-slate-500"}`}
              >
                {overdue ? "⚠ Vencido: " : "Vence: "}
                {new Date(loan.due_date).toLocaleDateString("es-ES")}
              </span>
            )}
            {loan.notes && (
              <span className="text-[10px] text-slate-600 italic truncate max-w-[120px]">
                {loan.notes}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {loan.return_date ? (
            <span className="text-[10px] px-2.5 py-1 rounded-full font-black border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              DEVUELTO
            </span>
          ) : (
            <>
              <span
                className={`text-[10px] px-2.5 py-1 rounded-full font-black border ${overdue ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}
              >
                {overdue ? "VENCIDO" : "ACTIVO"}
              </span>
              <button
                onClick={() => handleReturn(loan.id)}
                disabled={returning === loan.id}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black hover:bg-emerald-500/20 transition-all disabled:opacity-50 flex items-center gap-1"
              >
                {returning === loan.id ? (
                  <div className="w-3 h-3 border border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                ) : (
                  <>
                    <Icon name="check" className="w-3 h-3" /> Devolver
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Active loans */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-black text-white uppercase tracking-widest">
            Préstamos Activos
          </h2>
          {active.length > 0 && (
            <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-black">
              {active.length}
            </span>
          )}
        </div>
        {active.length === 0 ? (
          <div className="py-10 flex flex-col items-center text-slate-600 bg-white/[0.02] rounded-2xl border border-white/5">
            <Icon name="check" className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm font-bold">Sin préstamos activos</p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((loan) => (
              <LoanRow key={loan.id} loan={loan} />
            ))}
          </div>
        )}
      </div>

      {/* Returned */}
      {returned.length > 0 && (
        <div>
          <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest mb-4">
            Historial de Devoluciones
          </h2>
          <div className="space-y-2">
            {returned.slice(0, 20).map((loan) => (
              <LoanRow key={loan.id} loan={loan} />
            ))}
          </div>
        </div>
      )}

      {loans.length === 0 && (
        <div className="py-24 flex flex-col items-center text-slate-600">
          <Icon name="book" className="w-12 h-12 mb-4 opacity-30" />
          <p className="font-bold">Sin préstamos registrados</p>
          <p className="text-sm mt-1">Crea préstamos desde el inventario</p>
        </div>
      )}
    </div>
  );
}
