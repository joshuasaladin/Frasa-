-- Frasa HQ · Phase 1 · Sample SOPs
-- Three example procedures, loaded as DRAFTS and flagged is_sample. They are
-- starting points for Frasa to revise; nothing here is published, and the
-- wording does not describe Frasa's actual rules. They have no owner or review
-- date, so they cannot be published until someone reviews them and sets both.

do $$
declare
  v_sop uuid;
begin
  -- 1. Requesting a supplier quote ---------------------------------------
  insert into public.sops (title, department_id, category_id, tags, is_sample)
  values ('[SAMPLE] Requesting a supplier quote',
    (select id from public.departments where name = 'Purchasing'),
    (select id from public.sop_categories where name = 'Supplier management'),
    array['sample', 'supplier', 'quote'], true)
  returning id into v_sop;
  insert into public.sop_versions (sop_id, version_no, title, purpose, steps, links, change_summary)
  values (v_sop, 1, '[SAMPLE] Requesting a supplier quote',
    'SAMPLE - revise before publishing. Make sure every quote request gives the supplier the same complete information, so quotes can be compared and used in a freight estimate without follow-up questions.',
    $json$[
      {"title": "Confirm what is needed", "detail": "Confirm the product, specification, pack size and quantity with the person asking (sales or the department lead). Note the date the goods are needed in Aruba."},
      {"title": "Check existing information", "detail": "Look up the item and recent purchase history in NECS so the request refers to the correct item and you know the last price paid."},
      {"title": "Send the quote request", "detail": "Ask the supplier for: price per case, units per case, minimum order quantity, case dimensions and weight, cases per pallet, lead time, payment terms, quote validity, and the pickup or delivery point in Miami. [Frasa: add your standard request template and which suppliers need more than one quote.]"},
      {"title": "Create a follow-up task", "detail": "Create a shared task in Frasa HQ, due on the date you expect the answer, and link this SOP to it."},
      {"title": "Record the quote", "detail": "When the quote arrives, attach it to the task. Check that all requested details are present and ask for anything missing."},
      {"title": "Estimate the landed cost", "detail": "If you have freight access, enter the quote in the Freight calculator and link the saved estimate to the task. Otherwise hand the task to someone who does."},
      {"title": "Hand over for a decision", "detail": "[Frasa: who approves a purchase, and above what amount?] Reassign or comment on the task so the approver sees the quote and the estimate."}
    ]$json$::jsonb,
    '[]'::jsonb, 'Sample content for review.');

  -- 2. Reviewing a freight estimate ---------------------------------------
  insert into public.sops (title, department_id, category_id, tags, is_sample)
  values ('[SAMPLE] Reviewing a freight estimate',
    (select id from public.departments where name = 'Logistics'),
    (select id from public.sop_categories where name = 'Freight and costing'),
    array['sample', 'freight', 'landed cost'], true)
  returning id into v_sop;
  insert into public.sop_versions (sop_id, version_no, title, purpose, steps, links, change_summary)
  values (v_sop, 1, '[SAMPLE] Reviewing a freight estimate',
    'SAMPLE - revise before publishing. A second person checks a saved freight estimate before its landed costs are used for pricing or purchasing decisions.',
    $json$[
      {"title": "Open the saved estimate", "detail": "Open the estimate from the task link or the Freight calculator list. Check that it is not labelled Incomplete; an incomplete estimate must not be used."},
      {"title": "Check the product lines", "detail": "Compare supplier cost, case quantity and units per case with the supplier quote or purchase order. Check dimensions, weights and pallet counts against the supplier's packing information."},
      {"title": "Check the shipment charges", "detail": "Compare each charge with the forwarder's quote or invoice. Confirm the currency of each charge and that no expected charge is missing. [Frasa: list the charges you expect on a Miami-to-Aruba shipment.]"},
      {"title": "Check the exchange rate", "detail": "Confirm the USD/AWG rate entered on the estimate is the rate Frasa uses for costing. [Frasa: state the rate source.]"},
      {"title": "Check duties and taxes", "detail": "Confirm the percentage and the basis of each percentage-based charge. [Frasa: state your duty and tax rates and what they are calculated on. The calculator does not assume any rate.]"},
      {"title": "Check the allocation methods", "detail": "For each shared charge, confirm the allocation method makes sense (for example ocean freight by volume). Use the calculation breakdown to confirm the allocations add up to the charge."},
      {"title": "Record the review", "detail": "Comment on the linked task that the estimate version number was reviewed, or note what needs correcting. Corrections are saved as a new version; earlier versions stay unchanged."}
    ]$json$::jsonb,
    '[]'::jsonb, 'Sample content for review.');

  -- 3. Custom-branded customer order follow-up ---------------------------
  insert into public.sops (title, department_id, category_id, tags, is_sample)
  values ('[SAMPLE] Following up on a custom-branded customer order',
    (select id from public.departments where name = 'Sales'),
    (select id from public.sop_categories where name = 'Customer orders'),
    array['sample', 'custom order', 'branding', 'follow-up'], true)
  returning id into v_sop;
  insert into public.sop_versions (sop_id, version_no, title, purpose, steps, links, change_summary)
  values (v_sop, 1, '[SAMPLE] Following up on a custom-branded customer order',
    'SAMPLE - revise before publishing. Keep a custom-branded order (for example printed cups or pizza boxes) moving from artwork approval to customer pickup or delivery, with one person accountable at each step.',
    $json$[
      {"title": "Create the tracking task", "detail": "When the customer confirms the order, create a shared task owned by the sales representative. Put the NECS order reference in the task's external link field."},
      {"title": "Collect the artwork", "detail": "Get the customer's artwork in the format the supplier requires and attach it to the task. [Frasa: list accepted file formats.]"},
      {"title": "Get the proof approved", "detail": "Send the supplier's proof to the customer and attach the customer's written approval to the task. Do not release the order to production without it."},
      {"title": "Confirm production and expected arrival", "detail": "Ask purchasing to confirm the order with the supplier and the expected arrival date in Aruba. Set the task due date to the next follow-up date and tell the customer what to expect."},
      {"title": "Follow up while in transit", "detail": "Check the status with purchasing or logistics on each follow-up date. If the date slips, update the task and inform the customer the same day."},
      {"title": "Check on arrival", "detail": "Ask the warehouse to check quantity and print quality against the approved proof before the customer is told the order is ready. [Frasa: what happens when the print is wrong or goods are damaged?]"},
      {"title": "Arrange pickup or delivery", "detail": "Agree pickup or delivery with the customer. Invoicing is done in NECS / QuickBooks as usual."},
      {"title": "Close the task", "detail": "Complete the task once the customer has the goods, and note any feedback or reorder interest in a comment."}
    ]$json$::jsonb,
    '[]'::jsonb, 'Sample content for review.');
end $$;
