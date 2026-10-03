import { useEffect, useRef } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Seo } from '@/components/site/Seo';
import { Stepper } from '@/components/site/Stepper';
import { ReceiptActions, ReceiptCard, WhatsAppNotice } from '@/components/site/Receipt';
import { recallReceipt } from './draft';
import type { BookingReceipt, WhatsAppLaunch } from '@/types/db';

export default function Confirmation() {
  const location = useLocation();
  const state = location.state as { receipt?: BookingReceipt; whatsapp?: WhatsAppLaunch } | null;
  const receipt = state?.receipt ?? recallReceipt();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  // Reached directly with nothing to show: this page never invents a confirmation.
  if (!receipt) return <Navigate to="/book" replace />;
  const isBooking = receipt.request_type === 'Vehicle Booking';
  return (
    <div className="container-page max-w-4xl py-8 sm:py-12">
      <Seo title="Booking Request Received" noindex />
      {isBooking && <Stepper current={5} />}
      <h1 ref={heading} tabIndex={-1} className="text-[28px] leading-tight outline-none sm:text-4xl">{isBooking ? 'Booking Request Received' : 'Request Received'}</h1>
      <p className="mb-6 mt-2 text-[15px] text-muted">Your request has been recorded for review. Keep your reference for when our office contacts you.</p>
      <div className="mb-4"><WhatsAppNotice launch={state?.whatsapp} receipt={receipt} /></div>
      <ReceiptCard receipt={receipt} />
      <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/" className="btn-secondary">Back to Home</Link>
        <ReceiptActions receipt={receipt} />
      </div>
    </div>
  );
}
