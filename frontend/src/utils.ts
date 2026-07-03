/** Fonctions pures du module Calendar (testables). */

/** Renvoie le lundi (00:00) de la semaine contenant `d`. */
export function startOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

/** Les 7 dates (lundi→dimanche) de la semaine débutant à `monday`. */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

/** Même jour civil (heure locale) qu'une date ISO ? */
export function isSameDay(iso: string, d: Date): boolean {
  const b = new Date(iso);
  return b.getFullYear() === d.getFullYear() && b.getMonth() === d.getMonth() && b.getDate() === d.getDate();
}

/** Heure « HH:mm » (locale FR) d'une date ISO. */
export function isoTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Date+heure « jj/mm/aaaa hh:mm » (locale FR) d'une date ISO. */
export function formatDateTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Valeur `<input type="datetime-local">` (heure locale) -> ISO UTC (« …Z ») pour le backend. */
export function localInputToIsoUtc(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** ISO (UTC) -> valeur `<input type="datetime-local">` (heure locale « yyyy-MM-ddTHH:mm »). */
export function isoUtcToLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Couleur CSS d'un calendrier (repli). */
export function calendarColor(color?: string): string {
  return color && color.trim() ? color : '#2a9cc8';
}
