import type { Ticket } from "../types/Ticket";

const API_BASE_URL = "/api";

export async function getTickets(): Promise<Ticket[]> {
  const response = await fetch(`${API_BASE_URL}/tickets`);

  if (!response.ok) {
    throw new Error(`Failed to fetch tickets. Status: ${response.status}`);
  }

  return response.json();
}

export async function getTicketById(ticketId: string): Promise<Ticket> {
  const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch ticket. Status: ${response.status}`);
  }

  return response.json();
}

export async function updateTicket(
  ticketId: string,
  updates: Partial<Ticket>,
): Promise<Ticket> {
  const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error(`Failed to update ticket. Status: ${response.status}`);
  }

  return response.json();
}
