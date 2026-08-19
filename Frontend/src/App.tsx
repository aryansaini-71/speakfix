import { useEffect, useState } from 'react'
import './App.css'
import {
  getTickets,
  getTicketById,
  updateTicket,
} from './services/api'
import type { Ticket } from './types/Ticket'

function App() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('All')
  const [view, setView] = useState<'list' | 'history' | 'detail'>('list')
  const [detailOrigin, setDetailOrigin] =
    useState<'list' | 'history'>('list')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [editLocation, setEditLocation] = useState('')
  const [editEquipment, setEditEquipment] = useState('')
  const [editAssignedTo, setEditAssignedTo] = useState('')
  const [editStatus, setEditStatus] =
    useState<Ticket['status']>('Open')
  const [editIssueSummary, setEditIssueSummary] = useState('')

  const [locationError, setLocationError] = useState(false)
  const [equipmentError, setEquipmentError] = useState(false)
  const [assignedToError, setAssignedToError] = useState(false)

  const allowedTextPattern = /^[a-zA-Z0-9\s.#-]*$/

  useEffect(() => {
    async function loadTickets() {
      try {
        const data = await getTickets()
        setTickets(data)
      } catch (err) {
        console.error(err)
        setError('Could not load tickets.')
      } finally {
        setLoading(false)
      }
    }

    loadTickets()
  }, [])

  const pendingCount = tickets.filter(
    (ticket) => ticket.status === 'Pending Review'
  ).length

  const openCount = tickets.filter(
    (ticket) => ticket.status === 'Open'
  ).length

  const inProgressCount = tickets.filter(
    (ticket) =>
      ticket.status === 'In Progress' ||
      ticket.status === 'Processing'
  ).length

  const resolvedCount = tickets.filter(
    (ticket) => ticket.status === 'Resolved'
  ).length

  const filteredTickets =
    statusFilter === 'All'
      ? tickets
      : statusFilter === 'In Progress'
        ? tickets.filter(
            (ticket) =>
              ticket.status === 'In Progress' ||
              ticket.status === 'Processing'
          )
        : tickets.filter(
            (ticket) => ticket.status === statusFilter
          )

  const resolvedTickets = tickets.filter(
    (ticket) => ticket.status === 'Resolved'
  )

  async function handleSelectTicket(
    ticketId: string,
    origin: 'list' | 'history' = 'list'
  ) {
    try {
      setDetailLoading(true)
      setError(null)
      setActionMessage(null)
      setIsEditing(false)
      setSelectedTicket(null)
      setDetailOrigin(origin)
      setView('detail')

      const ticket = await getTicketById(ticketId)

      setSelectedTicket(ticket)
    } catch (err) {
      console.error(err)
      setError('Could not load ticket details.')
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleApprove() {
    if (!selectedTicket) {
      return
    }

    const confirmed = window.confirm(
      'Are you sure you want to approve this ticket?'
    )

    if (!confirmed) {
      return
    }

    try {
      setActionLoading(true)
      setError(null)
      setActionMessage(null)

      const updatedTicket = await updateTicket(
        selectedTicket.ticket_id,
        {
          status: 'Open',
          requires_human_review: false,
        }
      )

      setSelectedTicket(updatedTicket)

      setTickets((currentTickets) =>
        currentTickets.map((ticket) =>
          ticket.ticket_id === updatedTicket.ticket_id
            ? updatedTicket
            : ticket
        )
      )

      setActionMessage('Ticket approved successfully.')
    } catch (err) {
      console.error(err)
      setError('Could not approve ticket.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReject() {
    if (!selectedTicket) {
      return
    }

    const confirmed = window.confirm(
      'Are you sure you want to reject this ticket?'
    )
    if (!confirmed) {
      return
    }
    try {
      setActionLoading(true)
      setError(null)
      setActionMessage(null)
      const updatedTicket = await updateTicket(
        selectedTicket.ticket_id,
        {
          status: 'Rejected',
        }
      )
      setSelectedTicket(updatedTicket)
      setTickets((currentTickets) =>
        currentTickets.map((ticket) =>
          ticket.ticket_id === updatedTicket.ticket_id
            ? updatedTicket
            : ticket
        )
      )
      setActionMessage('Ticket rejected.')
    } catch (err) {
      console.error(err)
      setError('Could not reject ticket.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleResolve() {
    if (!selectedTicket) {
      return
    }
    const confirmed = window.confirm(
      'Mark this ticket as resolved?'
    )
    if (!confirmed) {
      return
    }
    try {
      setActionLoading(true)
      setError(null)
      setActionMessage(null)
      const updatedTicket = await updateTicket(
        selectedTicket.ticket_id,
        {
          status: 'Resolved',
        }
      )
      setSelectedTicket(updatedTicket)
      setTickets((currentTickets) =>
        currentTickets.map((ticket) =>
          ticket.ticket_id === updatedTicket.ticket_id
            ? updatedTicket
            : ticket
        )
      )
      setActionMessage('Ticket marked resolved.')
    } catch (err) {
      console.error(err)
      setError('Could not resolve ticket.')
    } finally {
      setActionLoading(false)
    }
  }

  function handleEdit() {
    if (!selectedTicket) {
      return
    }

    setActionMessage(null)

    setLocationError(false)
    setEquipmentError(false)
    setAssignedToError(false)

    setEditLocation(
      selectedTicket.location ??
        (selectedTicket.unit_code
          ? `Unit ${selectedTicket.unit_code}`
          : '')
    )
    setEditEquipment(selectedTicket.equipment ?? '')
    setEditAssignedTo(selectedTicket.assigned_to ?? '')
    setEditStatus(selectedTicket.status)
    setEditIssueSummary(selectedTicket.issue_summary ?? '')

    setIsEditing(true)
  }

  function handleCancelEdit() {
    setLocationError(false)
    setEquipmentError(false)
    setAssignedToError(false)
    setIsEditing(false)
  }

  async function handleSaveEdit() {
    if (!selectedTicket) {
      return
    }

    if (
      !allowedTextPattern.test(editLocation) ||
      !allowedTextPattern.test(editEquipment) ||
      !allowedTextPattern.test(editAssignedTo)
    ) {
      setActionMessage(
        'Location, Equipment, and Assigned To contain invalid characters.'
      )
      return
    }

    const confirmed = window.confirm(
      'Are you sure you want to save these changes?'
    )

    if (!confirmed) {
      return
    }

    try {
      setActionLoading(true)
      setError(null)
      setActionMessage(null)

      const updatedTicket = await updateTicket(
        selectedTicket.ticket_id,
        {
          location: editLocation.trim() || null,
          equipment: editEquipment.trim() || null,
          assigned_to: editAssignedTo.trim() || null,
          status: editStatus,
          issue_summary: editIssueSummary.trim() || null,
        }
      )

      setSelectedTicket(updatedTicket)

      setTickets((currentTickets) =>
        currentTickets.map((ticket) =>
          ticket.ticket_id === updatedTicket.ticket_id
            ? updatedTicket
            : ticket
        )
      )

      setLocationError(false)
      setEquipmentError(false)
      setAssignedToError(false)
      setIsEditing(false)
      setActionMessage('Ticket updated successfully.')
    } catch (err) {
      console.error(err)
      setError('Could not update ticket.')
    } finally {
      setActionLoading(false)
    }
  }

  function handleBackToTickets() {
    setSelectedTicket(null)
    setActionMessage(null)
    setLocationError(false)
    setEquipmentError(false)
    setAssignedToError(false)
    setIsEditing(false)
    setView(detailOrigin)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">VM</div>

          <div>
            <h1>VMIS</h1>
            <p>Manager Dashboard</p>
          </div>
        </div>

        <nav className="nav-menu">
          <button
            className={`nav-item ${
              view === 'list' ||
              (view === 'detail' && detailOrigin === 'list')
                ? 'active'
                : ''
            }`}
            onClick={() => setView('list')}
          >
            Tickets
          </button>

          <button
            className={`nav-item ${
              view === 'history' ||
              (view === 'detail' && detailOrigin === 'history')
                ? 'active'
                : ''
            }`}
            onClick={() => setView('history')}
          >
            History
          </button>
        </nav>
      </aside>

      <main className="main-content">
        {view === 'list' && (
          <>
            <header className="page-header">
              <div>
                <p className="eyebrow">
                  Voice Maintenance Intake Station
                </p>

                <h2>Maintenance Tickets</h2>
              </div>

              <div className="header-badge">
                Manager View
              </div>
            </header>

            <section className="stats-grid">
              <article className="stat-card">
                <span>Pending Review</span>
                <strong>{pendingCount}</strong>
              </article>

              <article className="stat-card">
                <span>Open</span>
                <strong>{openCount}</strong>
              </article>

              <article className="stat-card">
                <span>In Progress</span>
                <strong>{inProgressCount}</strong>
              </article>

              <article className="stat-card">
                <span>Resolved</span>
                <strong>{resolvedCount}</strong>
              </article>
            </section>

            <section className="tickets-panel">
              <div className="panel-header">
                <div>
                  <h3>All Tickets</h3>
                  <p>
                    Review and manage maintenance requests.
                  </p>
                </div>

                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value)
                  }
                >
                  <option value="All">All</option>

                  <option value="Pending Review">
                    Pending Review
                  </option>

                  <option value="Open">
                    Open
                  </option>

                  <option value="In Progress">
                    In Progress
                  </option>

                  <option value="Resolved">
                    Resolved
                  </option>
                </select>
              </div>

              {loading && (
                <div className="empty-state">
                  <h4>Loading tickets...</h4>
                </div>
              )}

              {error && !detailLoading && (
                <div className="empty-state">
                  <h4>{error}</h4>
                </div>
              )}

              {!loading &&
                !error &&
                tickets.length === 0 && (
                  <div className="empty-state">
                    <h4>No tickets available</h4>
                  </div>
                )}

              {!loading &&
                !error &&
                tickets.length > 0 &&
                filteredTickets.length === 0 && (
                  <div className="empty-state">
                    <h4>
                      No tickets found for this status
                    </h4>
                  </div>
                )}

              {!loading &&
                !error &&
                filteredTickets.length > 0 && (
                  <div className="ticket-table">
                    <div className="ticket-row ticket-header">
                      <span>Ticket</span>
                      <span>Location</span>
                      <span>Equipment</span>
                      <span>Status</span>
                      <span>Created</span>
                    </div>

                    {filteredTickets.map((ticket) => (
                      <div
                        className="ticket-row clickable"
                        key={ticket.ticket_id}
                        onClick={() =>
                          handleSelectTicket(
                            ticket.ticket_id,
                            'list'
                          )
                        }
                      >
                        <span>
                          {ticket.ticket_id.slice(0, 8)}
                        </span>

                        <span>
                          {ticket.location ??
                            `Unit ${
                              ticket.unit_code ?? 'N/A'
                            }`}
                        </span>

                        <span>
                          {ticket.equipment ??
                            'Not classified'}
                        </span>

                        <span>
                          {ticket.status}
                        </span>

                        <span>
                          {new Date(
                            ticket.created_at
                          ).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
            </section>
          </>
        )}

        {view === 'history' && (
          <>
            <header className="page-header">
              <div>
                <p className="eyebrow">
                  Voice Maintenance Intake Station
                </p>

                <h2>Ticket History</h2>
              </div>

              <div className="header-badge">
                Manager View
              </div>
            </header>

            <section className="tickets-panel">
              <div className="panel-header">
                <div>
                  <h3>Resolved Tickets</h3>
                  <p>
                    Review completed maintenance requests.
                  </p>
                </div>
              </div>

              {loading && (
                <div className="empty-state">
                  <h4>Loading tickets...</h4>
                </div>
              )}

              {error && (
                <div className="empty-state">
                  <h4>{error}</h4>
                </div>
              )}

              {!loading &&
                !error &&
                resolvedTickets.length === 0 && (
                  <div className="empty-state">
                    <h4>No resolved tickets available</h4>
                  </div>
                )}

              {!loading &&
                !error &&
                resolvedTickets.length > 0 && (
                  <div className="ticket-table">
                    <div className="ticket-row ticket-header">
                      <span>Ticket</span>
                      <span>Location</span>
                      <span>Equipment</span>
                      <span>Status</span>
                      <span>Created</span>
                    </div>

                    {resolvedTickets.map((ticket) => (
                      <div
                        className="ticket-row clickable"
                        key={ticket.ticket_id}
                        onClick={() =>
                          handleSelectTicket(
                            ticket.ticket_id,
                            'history'
                          )
                        }
                      >
                        <span>
                          {ticket.ticket_id.slice(0, 8)}
                        </span>

                        <span>
                          {ticket.location ??
                            `Unit ${
                              ticket.unit_code ?? 'N/A'
                            }`}
                        </span>

                        <span>
                          {ticket.equipment ??
                            'Not classified'}
                        </span>

                        <span>
                          {ticket.status}
                        </span>

                        <span>
                          {new Date(
                            ticket.created_at
                          ).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
            </section>
          </>
        )}

        {view === 'detail' && (
          <>
            <header className="page-header">
              <div>
                <p className="eyebrow">
                  Voice Maintenance Intake Station
                </p>

                <h2>Ticket Detail</h2>
              </div>

              <div className="header-badge">
                Manager View
              </div>
            </header>

            {detailLoading && (
              <section className="ticket-detail">
                <div className="empty-state">
                  <h4>Loading ticket details...</h4>
                </div>
              </section>
            )}

            {selectedTicket && !detailLoading && (
              <section className="ticket-detail">
                <div className="detail-header">
                  <div>
                    <p className="eyebrow">
                      Ticket Detail
                    </p>

                    <h3>
                      {selectedTicket.ticket_id.slice(
                        0,
                        8
                      )}
                    </h3>
                  </div>

                  <button
                    className="close-button"
                    onClick={handleBackToTickets}
                  >
                    ← Back to{' '}
                    {detailOrigin === 'history'
                      ? 'History'
                      : 'Tickets'}
                  </button>
                </div>

                <div className="detail-grid">
                  <div className="detail-card">
                    <span>Location</span>

                    {isEditing ? (
                      <>
                        <input
                          className="edit-input"
                          value={editLocation}
                          placeholder="Enter location"
                          onChange={(event) => {
                            const value = event.target.value

                            if (allowedTextPattern.test(value)) {
                              setEditLocation(value)
                              setLocationError(false)
                            } else {
                              setLocationError(true)
                            }
                          }}
                        />

                        {locationError && (
                          <span className="input-error">
                            Invalid character.
                          </span>
                        )}
                      </>
                    ) : (
                      <strong>
                        {selectedTicket.location ??
                          `Unit ${
                            selectedTicket.unit_code ??
                            'N/A'
                          }`}
                      </strong>
                    )}
                  </div>

                  <div className="detail-card">
                    <span>Equipment</span>

                    {isEditing ? (
                      <>
                        <input
                          className="edit-input"
                          value={editEquipment}
                          placeholder="Enter equipment"
                          onChange={(event) => {
                            const value = event.target.value

                            if (allowedTextPattern.test(value)) {
                              setEditEquipment(value)
                              setEquipmentError(false)
                            } else {
                              setEquipmentError(true)
                            }
                          }}
                        />

                        {equipmentError && (
                          <span className="input-error">
                            Invalid character.
                          </span>
                        )}
                      </>
                    ) : (
                      <strong>
                        {selectedTicket.equipment ??
                          'Not classified'}
                      </strong>
                    )}
                  </div>

                  <div className="detail-card">
                    <span>Status</span>

                    {isEditing ? (
                      <select
                        className="edit-input"
                        value={editStatus}
                        onChange={(event) =>
                          setEditStatus(
                            event.target.value as Ticket['status']
                          )
                        }
                      >
                        <option value="Pending Review">
                          Pending Review
                        </option>

                        <option value="Open">
                          Open
                        </option>

                        <option value="In Progress">
                          In Progress
                        </option>

                        <option value="Resolved">
                          Resolved
                        </option>
                      </select>
                    ) : (
                      <strong>
                        {selectedTicket.status}
                      </strong>
                    )}
                  </div>

                  <div className="detail-card">
                    <span>Assigned To</span>

                    {isEditing ? (
                      <>
                        <input
                          className="edit-input"
                          value={editAssignedTo}
                          placeholder="Assign to"
                          onChange={(event) => {
                            const value = event.target.value

                            if (allowedTextPattern.test(value)) {
                              setEditAssignedTo(value)
                              setAssignedToError(false)
                            } else {
                              setAssignedToError(true)
                            }
                          }}
                        />

                        {assignedToError && (
                          <span className="input-error">
                            Invalid character.
                          </span>
                        )}
                      </>
                    ) : (
                      <strong>
                        {selectedTicket.assigned_to ??
                          'Not assigned'}
                      </strong>
                    )}
                  </div>

                  <div className="detail-card">
                    <span>Confidence</span>

                    <strong>
                      {selectedTicket.confidence !== null
                        ? `${Math.round(
                            selectedTicket.confidence *
                              100
                          )}%`
                        : 'Not available'}
                    </strong>
                  </div>

                  <div className="detail-card">
                    <span>Human Review</span>

                    <strong>
                      {selectedTicket.requires_human_review ===
                      null
                        ? 'Not evaluated'
                        : selectedTicket.requires_human_review
                          ? 'Required'
                          : 'Not required'}
                    </strong>
                  </div>
                </div>

                <div className="transcript-card">
                  <h4>Transcript</h4>

                  <p>
                    {selectedTicket.transcript ||
                      'No transcript available.'}
                  </p>
                </div>

                <div className="transcript-card">
                  <h4>Cloud Transcript</h4>
                  <p>
                    {selectedTicket.transcript_cloud ||
                      'No cloud transcript available.'}
                  </p>
                </div>
                <div className="transcript-card">
                  <h4>Issue Summary</h4>

                  {isEditing ? (
                    <textarea
                      className="edit-textarea"
                      value={editIssueSummary}
                      placeholder="Enter issue summary"
                      onChange={(event) =>
                        setEditIssueSummary(
                          event.target.value
                        )
                      }
                    />
                  ) : (
                    <p>
                      {selectedTicket.issue_summary ??
                        'No issue summary available.'}
                    </p>
                  )}
                </div>

                <div className="audio-card">
                  <h4>Audio Recording</h4>

                  <audio
                    controls
                    src={selectedTicket.audio_url}
                  >
                    Your browser does not support audio playback.
                  </audio>
                </div>

                {actionMessage && (
                  <div className="action-message">
                    {actionMessage}
                  </div>
                )}

                <div className="manager-actions">
                  {isEditing ? (
                    <>
                      <button
                        className="approve-button"
                        onClick={handleSaveEdit}
                        disabled={actionLoading}
                      >
                        {actionLoading
                          ? 'Saving...'
                          : 'Save Changes'}
                      </button>

                      <button
                        className="edit-button"
                        onClick={handleCancelEdit}
                        disabled={actionLoading}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      {(selectedTicket.status === 'Pending Review' ||
                        selectedTicket.status === 'Processing' ||
                        selectedTicket.status === 'In Progress') && (
                        <button
                          className="approve-button"
                          onClick={handleApprove}
                          disabled={actionLoading}
                        >
                          {actionLoading
                            ? 'Approving...'
                            : 'Approve'}
                        </button>
                      )}

                      <button
                        className="edit-button"
                        onClick={handleEdit}
                      >
                        Edit
                      </button>

                      {selectedTicket.status !== 'Resolved' && (
                        <button className="reject-button" onClick={handleReject} disabled={actionLoading}>
                          Reject
                        </button>
                    )}
                      {selectedTicket.status === "Open" && (
                        <button
                          className="approve-button"
                          onClick={handleResolve}
                          disabled={actionLoading}
                        >
                          {actionLoading
                            ? "Resolving..."
                            : "Mark Resolved"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default App

