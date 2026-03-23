import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ToastContainer, toast } from "react-toastify";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const COMPANY = {
  name: "JAI DURGA BUSINESS",
  address:
    "No.19/6, Thiruvalluvar 4th St, Thiruneermalai Main Road, Kadaperi, Chennai-600045",
  monthLabel: "Payslip for the month of March 2026"
};

const PAGE_SIZE = 6;

const normalize = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const pick = (row, keys) => {
  for (const key of keys) {
    const found = row[normalize(key)];
    if (found !== undefined && found !== null && found !== "") return found;
  }
  return "";
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/,/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toWords = (amount) => {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen"
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety"
  ];
  const chunkToWords = (num) => {
    if (num === 0) return "";
    if (num < 20) return ones[num];
    if (num < 100) return `${tens[Math.floor(num / 10)]} ${ones[num % 10]}`.trim();
    return `${ones[Math.floor(num / 100)]} Hundred ${chunkToWords(num % 100)}`.trim();
  };

  if (!amount) return "";
  const rupees = Math.floor(amount);
  const lakh = Math.floor(rupees / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundred = rupees % 1000;
  const parts = [];
  if (lakh) parts.push(`${chunkToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${chunkToWords(thousand)} Thousand`);
  if (hundred) parts.push(chunkToWords(hundred));
  return `${parts.join(" ")} Only`.replace(/\s+/g, " ").trim();
};

const buildEmployees = (rows) =>
  rows
    .map((row, index) => {
      const empCode = pick(row, ["EMP CODE", "Emp No", "EMP NO", "EMPID", "EMP ID"]);
      const empName = pick(row, ["EMP NAME", "Emp Name", "NAME"]);
      if (!empCode && !empName) return null;

      const basic = toNumber(pick(row, ["BASIC", "STANDARD BASIC"]));
      const hra = toNumber(
        pick(row, ["HOUSE RENT ALLOWANCE", "HRA", "STANDARD HOUSE RENT ALLOWANCE"])
      );
      const washing = toNumber(pick(row, ["WASHING ALLOWANCE", "WASHING ALLOANCE"]));
      const otherAllow = toNumber(pick(row, ["OTHER ALLOWANCE"]));
      const totalEarning = toNumber(
        pick(row, ["TOTAL EARNED GROSS", "TOTAL EARNING", "STANDARD GROSS"])
      );

      const pf = toNumber(pick(row, ["EARNED EMPLOYEE PF @12%", "PF"]));
      const esi = toNumber(pick(row, ["EARNED EMPLOYEE ESIC @0.75%", "ESI"]));
      const profTax = toNumber(pick(row, ["STANDARD PROFESSIONAL TAX", "PROFESSIONAL TAX"]));
      const totalDeduction = toNumber(pick(row, ["TOTAL DEDUCTION", "TOTAL DEDUCTIONS"]));
      const netPay = toNumber(pick(row, ["NET PAY"]));

      const computedEarning = totalEarning || basic + hra + washing + otherAllow;
      const computedDeduction = totalDeduction || pf + esi + profTax;
      const computedNet = netPay || computedEarning - computedDeduction;

      return {
        id: `${empCode || "EMP"}-${index}`,
        empCode,
        empName,
        designation: pick(row, ["DESIGNATION"]),
        location: pick(row, ["PLANT LOCATIONS", "LOCATION", "DEPARTMENT/LOCATION"]),
        presentDays: pick(row, ["PAYABLE DAYS", "PRESENT DAYS", "TOTAL DAYS"]),
        lopDays: pick(row, ["LOP"]),
        earnings: {
          basic,
          hra,
          washing,
          otherAllow,
          total: computedEarning
        },
        deductions: {
          pf,
          esi,
          profTax,
          total: computedDeduction
        },
        netPay: computedNet
      };
    })
    .filter(Boolean);

const selectBestSheet = (workbook) => {
  const payrollSheet = workbook.SheetNames.find((name) =>
    name.toLowerCase().includes("payroll")
  );
  if (payrollSheet) return payrollSheet;
  return workbook.SheetNames[0];
};

const buildRowsFromSheet = (sheet) => {
  const table = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!table.length) return [];

  const headerIndex = table.findIndex((row) =>
    row.some((cell) => ["EMPCODE", "EMPNAME", "EMPLOYEE"].includes(normalize(cell)))
  );
  const safeHeaderIndex = headerIndex >= 0 ? headerIndex : 0;
  const headers = table[safeHeaderIndex].map((cell) => String(cell || ""));
  const dataRows = table.slice(safeHeaderIndex + 1).filter((row) =>
    row.some((cell) => String(cell || "").trim() !== "")
  );

  return dataRows.map((row) => {
    const mapped = {};
    headers.forEach((header, idx) => {
      if (!header) return;
      mapped[normalize(header)] = row[idx];
    });
    return mapped;
  });
};

export default function App() {
  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const payslipRef = useRef(null);

  const selected = useMemo(
    () => employees.find((emp) => emp.id === selectedId) || employees[0],
    [employees, selectedId]
  );

  const filteredEmployees = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((emp) => {
      return (
        String(emp.empCode || "").toLowerCase().includes(query) ||
        String(emp.empName || "").toLowerCase().includes(query) ||
        String(emp.designation || "").toLowerCase().includes(query)
      );
    });
  }, [employees, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE));
  const pagedEmployees = filteredEmployees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, employees.length]);

  const handleImport = async (file) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const sheetName = selectBestSheet(workbook);
    const sheet = workbook.Sheets[sheetName];
    const normalizedRows = buildRowsFromSheet(sheet);

    if (!normalizedRows.length) {
      toast.error("No rows found in the uploaded file.");
      return;
    }

    const parsed = buildEmployees(normalizedRows);
    setEmployees(parsed);
    setSelectedId(parsed[0]?.id || "");
    toast.success(`Imported ${parsed.length} employee rows successfully.`);
  };

  const onFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    handleImport(file).catch(() => {
      toast.error("Import failed. Please check the file format.");
    });
  };

  const downloadPdf = async () => {
    if (!payslipRef.current) return;
    const element = payslipRef.current;
    const canvas = await html2canvas(element, { scale: 2, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 16;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const y = (pageHeight - imgHeight) / 2;
    pdf.addImage(imgData, "PNG", 8, Math.max(8, y), imgWidth, imgHeight);
    pdf.save(`${selected?.empName || "payslip"}.pdf`);
  };

  return (
    <div className="app">
      <ToastContainer position="top-right" autoClose={2500} />
      <header className="hero">
        <div>
          <p className="eyebrow">Payslip Studio</p>
          <h1>Import payroll data and generate clean, client-ready payslips.</h1>
          <p className="subhead">
            Upload an Excel or CSV file, store the data in-memory, and export a professional payslip
            PDF instantly.
          </p>
        </div>
        <div className="upload-card">
          <div className="upload-box">
            <div>
              <h3>Upload Payroll File</h3>
              <p>Accepted formats: .xlsx, .xls, .csv</p>
            </div>
            <label className="upload-button">
              Import File
              <input type="file" accept=".xlsx,.xls,.csv" onChange={onFileChange} />
            </label>
          </div>
          <div className="stats">
            <div>
              <span>Employees</span>
              <strong>{employees.length}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{employees.length ? "Ready" : "Awaiting import"}</strong>
            </div>
          </div>
        </div>
      </header>

      <main className="content">
        <section className="roster">
          <div className="section-title">
            <h2>Employee List</h2>
            <p>Select an employee to preview the payslip.</p>
          </div>

          <div className="search-row">
            <input
              className="search-input"
              type="search"
              placeholder="Search by Emp ID, name, or designation"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <span className="search-count">{filteredEmployees.length} results</span>
          </div>

          <div className="employee-list">
            {filteredEmployees.length === 0 && (
              <div className="empty-state">No employees match your search.</div>
            )}
            {pagedEmployees.map((emp) => (
              <button
                key={emp.id}
                className={`employee-card ${selected?.id === emp.id ? "active" : ""}`}
                onClick={() => setSelectedId(emp.id)}
              >
                <div>
                  <h4>{emp.empName || "Employee"}</h4>
                  <p>{emp.designation || "Designation"}</p>
                </div>
                <span>{emp.empCode || "-"}</span>
              </button>
            ))}
          </div>

          <div className="pagination">
            <button
              className="page-button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
            >
              Prev
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              className="page-button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        </section>

        <section className="payslip-section">
          <div className="section-title row">
            <div>
              <h2>Payslip Preview</h2>
              <p>Styled to match your sample payslip layout.</p>
            </div>
            <button className="primary" onClick={downloadPdf} disabled={!selected}>
              Download PDF
            </button>
          </div>

          {selected && (
            <div className="payslip" ref={payslipRef}>
              <div className="payslip-header">
                <h3>{COMPANY.name}</h3>
                <p>{COMPANY.address}</p>
                <p className="subtitle">{COMPANY.monthLabel}</p>
              </div>

              <div className="payslip-grid">
                <div className="info">
                  <div>
                    <span>Emp No</span>
                    <strong>{selected.empCode || "-"}</strong>
                  </div>
                  <div>
                    <span>Emp Name</span>
                    <strong>{selected.empName || "-"}</strong>
                  </div>
                  <div>
                    <span>Designation</span>
                    <strong>{selected.designation || "-"}</strong>
                  </div>
                  <div>
                    <span>Department/Location</span>
                    <strong>{selected.location || "-"}</strong>
                  </div>
                </div>
                <div className="info">
                  <div>
                    <span>Present Days</span>
                    <strong>{selected.presentDays || "-"}</strong>
                  </div>
                  <div>
                    <span>LOP Days</span>
                    <strong>{selected.lopDays || "-"}</strong>
                  </div>
                  <div>
                    <span>Net Pay</span>
                    <strong>₹ {selected.netPay.toLocaleString("en-IN")}</strong>
                  </div>
                  <div>
                    <span>Amount in Words</span>
                    <strong>{toWords(selected.netPay)}</strong>
                  </div>
                </div>
              </div>

              <div className="table">
                <div className="table-header">
                  <span>Description</span>
                  <span>Scale</span>
                  <span>Earn Amt</span>
                  <span>Description</span>
                  <span>Deduct Amt</span>
                </div>
                <div className="table-row">
                  <span>Basic</span>
                  <span>{selected.earnings.basic.toLocaleString("en-IN")}</span>
                  <span>{selected.earnings.basic.toLocaleString("en-IN")}</span>
                  <span>PF</span>
                  <span>{selected.deductions.pf.toLocaleString("en-IN")}</span>
                </div>
                <div className="table-row">
                  <span>HRA</span>
                  <span>{selected.earnings.hra.toLocaleString("en-IN")}</span>
                  <span>{selected.earnings.hra.toLocaleString("en-IN")}</span>
                  <span>ESI</span>
                  <span>{selected.deductions.esi.toLocaleString("en-IN")}</span>
                </div>
                <div className="table-row">
                  <span>Washing</span>
                  <span>{selected.earnings.washing.toLocaleString("en-IN")}</span>
                  <span>{selected.earnings.washing.toLocaleString("en-IN")}</span>
                  <span>Professional Tax</span>
                  <span>{selected.deductions.profTax.toLocaleString("en-IN")}</span>
                </div>
                <div className="table-row">
                  <span>Other Allow</span>
                  <span>{selected.earnings.otherAllow.toLocaleString("en-IN")}</span>
                  <span>{selected.earnings.otherAllow.toLocaleString("en-IN")}</span>
                  <span></span>
                  <span></span>
                </div>
                <div className="table-row total">
                  <span>Total Earning</span>
                  <span></span>
                  <span>{selected.earnings.total.toLocaleString("en-IN")}</span>
                  <span>Total Deductions</span>
                  <span>{selected.deductions.total.toLocaleString("en-IN")}</span>
                </div>
              </div>

              <div className="signatures">
                <div>
                  <span>Authorised Signatory</span>
                </div>
                <div>
                  <span>Employee's Signatory</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
