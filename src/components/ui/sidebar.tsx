"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, VariantProps } from "class-variance-authority"
import { PanelLeftIcon } from "lucide-react"

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = React.useState(defaultOpen)
  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [setOpenProp, open]
  )

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
  }, [isMobile, setOpen, setOpenMobile])

  // Adds a keyboard shortcut to toggle the sidebar.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? "expanded" : "collapsed"

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="sidebar-wrapper"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            "group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="bg-sidebar text-sidebar-foreground w-(--sidebar-width) p-0 [&>button]:hidden"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      className="group peer text-sidebar-foreground hidden md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="bg-sidebar group-data-[variant=floating]:border-sidebar-border flex h-full w-full flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn("size-7", className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      {...props}
    />
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "bg-background relative flex w-full flex-1 flex-col",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  )
}

function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("bg-background h-8 w-full shadow-none", className)}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("bg-sidebar-border mx-2 w-auto", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      d…26024 tokens truncated…  id: string
  requestId: string
  senderId: string
  content: string
  isInternal: boolean
  isRead: boolean
  createdAt: string
  sender: { id: string; name: string; role: string; company?: string | null }
}

export interface ApiPayment {
  id: string
  type: string
  label?: string | null
  amount: number
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'
  method?: string | null
  transactionId?: string | null
  receiptNo?: string | null
  paidAt?: string | null
  note?: string | null
  createdAt: string
  milestone?: { title: string } | null
  request?: { requestCode: string; title: string; executionModel: string; customer?: { name: string; email: string } }
}

export interface ApiDocument {
  id: string
  name: string
  fileName: string
  mimeType: string
  size: number
  category: string
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SHARED'
  reviewNote?: string | null
  isDeliverable?: boolean
  documentRequestId?: string | null
  uploadedById?: string | null
  createdAt: string
}

export interface ApiDocumentRequest {
  id: string
  requestId: string
  title: string
  description: string
  category: string
  mandatory: boolean
  source: 'TEMPLATE' | 'STAFF' | 'SUBMISSION'
  status: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'WAIVED'
  dueDate?: string | null
  reviewNote?: string | null
  requestedBy?: { name: string } | null
  createdAt: string
}

export interface ApiTask {
  id: string
  title: string
  detail?: string | null
  owner: 'CUSTOMER' | 'TEAM'
  isDone: boolean
  createdAt: string
}

export interface ApiStatusEvent {
  id: string
  status: string
  stage: string
  progress: number
  note?: string | null
  createdAt: string
  createdBy?: { name: string } | null
}

export interface ApiCategory {
  id: string
  code: string
  slug: string
  name: string
  description: string
  icon: string
  featured: boolean
  faqs?: string
  sortOrder: number
  subcategories?: { id: string; name: string; slug: string }[]
}

export interface ApiCatalogService {
  id: string
  name: string
  slug: string
  description: string
  executionType: string
  status: 'AVAILABLE' | 'COMING_SOON'
  featured: boolean
  timeline: string
  icon: string
  scopeExamples: string
  deliverables: string
  process?: string
  formConfig?: string
  docRequirements?: string
  categoryId?: string
  subcategoryId?: string | null
  category?: { code: string; name: string; slug: string; icon: string; faqs?: string }
  subcategory?: { name: string } | null
  active?: boolean
  displayOrder?: number
}

export interface ApiQuotationItem {
  id?: string
  description: string
  detail?: string
  quantity: number
  unit: string
  unitPrice: number
  amount: number
  sortOrder: number
}

export interface ApiQuotation {
  id: string
  quotationNo: string
  requestId: string
  version: number
  status: string
  scope: string
  deliverablesNote: string
  timelineNote: string
  paymentTerms: string
  notes: string
  internalNotes?: string | null
  subtotal: number
  taxLabel: string
  taxRatePct: number
  taxAmount: number
  total: number
  validUntil?: string | null
  lockedAt?: string | null
  customerNote?: string | null
  acceptedAt?: string | null
  sentAt?: string | null
  createdAt: string
  items: ApiQuotationItem[]
  createdBy?: { name: string } | null
  request?: {
    id: string
    requestCode: string
    title: string
    status: string
    executionModel: string
    customer?: { id: string; name: string; company?: string | null; email: string }
  }
}

export interface ApiMilestone {
  id: string
  title: string
  description: string
  weight: number
  amount?: number // client billing (hidden from vendors on managed projects)
  vendorPayoutAmount?: number | null // vendor's payout (managed execution; null = to be confirmed)
  payoutStatus?: 'PENDING' | 'RELEASED'
  payoutReleasedAt?: string | null
  payoutNote?: string
  dueDate?: string | null
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'APPROVED'
  completedAt?: string | null
  sortOrder: number
}

export interface ApiProjectTask {
  id: string
  title: string
  detail: string
  assigneeId?: string | null
  assignee?: { id: string; name: string } | null
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED'
  dueDate?: string | null
  createdAt: string
}

export interface ApiProject {
  id: string
  requestId: string
  status: string
  executionModel: string
  vendorId?: string | null
  vendor?: { id: string; name: string; vendorProfile?: { businessName: string; rating: number; logoUrl?: string } | null } | null
  startedAt?: string | null
  expectedEndDate?: string | null
  completedAt?: string | null
  progressPct: number
  milestones: ApiMilestone[]
  tasks?: ApiProjectTask[]
}

export interface ApiVendorConnection {
  id: string
  requestId: string
  vendorId: string
  model: 'DIRECT_CONNECTION' | 'MANAGED'
  status: 'PROPOSED' | 'AUTHORIZED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  connectionFee: number
  managedFeeNote?: string
  feePaid: boolean
  authorizedAt?: string | null
  completedAt?: string | null
  notes?: string
  createdAt: string
  vendor?: { id: string; name: string; email: string; vendorProfile?: { businessName: string; rating: number; serviceLocations?: string; logoUrl?: string } | null }
  request?: { id: string; requestCode: string; title: string; status: string; executionModel: string; customer?: { id: string; name: string; company?: string | null; email: string } }
}

export interface ApiInvoice {
  id: string
  invoiceNo: string
  requestId: string
  type: string
  description: string
  amount: number
  gstRatePct: number
  gstAmount: number
  totalAmount: number
  billToName: string
  billToGstin?: string | null
  status: 'ISSUED' | 'PAID' | 'CANCELLED'
  issuedAt: string
  request?: { requestCode: string; title: string; customer?: { name: string; company?: string | null; email: string } }
}

export interface ApiRequest {
  id: string
  requestCode: string
  title: string
  description: string
  expectedDeliverables: string
  preferredTimeline: string
  projectLocation: string
  additionalNotes: string
  serviceId?: string | null
  customCategory?: string | null
  formResponses: string
  draft: boolean
  stage: string
  status: string
  progress: number
  executionModel: string
  assignedToId?: string | null
  vendorId?: string | null
  internalNotes?: string | null
  pendingAction?: string | null
  createdAt: string
  updatedAt: string
  service?: ApiCatalogService | null
  customer?: { id: string; name: string; email: string; phone?: string | null; company?: string | null }
  assignedTo?: { id: string; name: string; email: string; role?: string } | null
  vendor?: { id: string; name: string; vendorProfile?: { businessName: string; logoUrl?: string } | null } | null
  documents?: ApiDocument[]
  documentRequests?: ApiDocumentRequest[]
  payments?: ApiPayment[]
  invoices?: ApiInvoice[]
  quotations?: ApiQuotation[]
  project?: ApiProject | null
  vendorConnections?: ApiVendorConnection[]
  messages?: ApiMessage[]
  statusHistory?: ApiStatusEvent[]
  tasks?: ApiTask[]
  refunds?: ApiRefund[]
  credentials?: ApiCredentialShare[]
  _count?: { messages: number; documentRequests: number }
}

export interface ApiRequestRequirement {
  id: string
  serviceId: string
  requirementId: string
  label: string
  category: string
  mandatory: boolean
  description?: string | null
  status: 'PENDING' | 'UPLOADED' | 'APPROVED' | 'REJECTED' | 'WAIVED'
  service?: { id: string; name: string }
}

export interface ApiRefund {
  id: string
  amount: number
  reason: string
  policyNote?: string | null
  status: 'REQUESTED' | 'PROCESSED' | 'REJECTED'
  decisionNote?: string | null
  processedAt?: string | null
  createdAt: string
  initiatedBy?: { name: string } | null
  decidedBy?: { name: string } | null
}

export interface ApiCredentialShare {
  id: string
  title: string
  hint?: string | null
  status: 'ACTIVE' | 'REVOKED'
  accessCount: number
  lastAccessedAt?: string | null
  createdAt: string
  createdBy?: { name: string } | null
}

export interface ApiNotification {
  id: string
  title: string
  body: string
  type: string
  requestId?: string | null
  isRead: boolean
  createdAt: string
}

// Display helper: service label for a request (catalog name or custom category)
export function requestServiceLabel(r: ApiRequest): string {
  if (r.service?.name) return r.service.name
  if (r.customCategory) return `Custom — ${r.customCategory}`
  return 'Service'
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options?.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  })
  let json: { ok: boolean; data?: T; error?: string } | null = null
  try {
    json = await res.json()
  } catch {
    throw new ApiError('Server returned an invalid response', res.status)
  }
  if (!res.ok || !json?.ok) {
    throw new ApiError(json?.error || `Request failed (${res.status})`, res.status)
  }
  return json.data as T
}
