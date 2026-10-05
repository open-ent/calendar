package net.atos.entng.calendar.core.enums;

/**
 * Statut d'une proposition de réservation RBS sur un agenda partagé n'appartenant pas à l'auteur
 * (point B2 du chantier "vue consolidée EDT+RBS"). Sans rapport avec
 * {@code net.atos.entng.rbs.BookingStatus} (CREATED/VALIDATED/REFUSED/SUSPENDED) : la réservation
 * RBS elle-même n'existe pas tant que cette proposition n'est pas ACCEPTED.
 */
public enum BookingProposalStatus {
    PENDING("PENDING"),
    ACCEPTED("ACCEPTED"),
    REFUSED("REFUSED");

    private final String value;

    BookingProposalStatus(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public static BookingProposalStatus fromValue(String value) {
        for (BookingProposalStatus status : values()) {
            if (status.value.equalsIgnoreCase(value)) {
                return status;
            }
        }
        return null;
    }
}
