
import * as XLSX from 'xlsx';
import { ClientDetails, Room, BrandingSettings, Currency, CURRENCIES, BoqItem, ViewMode } from '../types';
import { companyTemplate } from '../data/scopeAndTermsData';
import { getExchangeRates } from './currency';

const createStyledCell = (value: any, style: any, type: 's' | 'n' | 'b' | 'd' = 's') => {
    return { t: type, v: value, s: style };
};

export const exportToXlsx = async (
    rooms: Room[],
    clientDetails: ClientDetails,
    margin: number,
    branding: BrandingSettings,
    selectedCurrency: Currency,
    viewMode: ViewMode,
) => {
    const wb = XLSX.utils.book_new();
    const usedSheetNames = new Set<string>();

    // --- STYLES ---
    const brandColor = branding.primaryColor.replace('#', '');
    
    const styles = {
        header: {
            fill: { fgColor: { rgb: brandColor } },
            font: { color: { rgb: "FFFFFFFF" }, bold: true, sz: 11 },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        },
        sectionHeader: {
            font: { bold: true, sz: 12, color: { rgb: "FF000000" } },
            fill: { fgColor: { rgb: "FFD9D9D9" } }, // Light Grey
            border: { bottom: { style: 'thin' } }
        },
        title: {
            font: { bold: true, sz: 16, color: { rgb: brandColor } },
        },
        label: { font: { bold: true } },
        total: { font: { bold: true }, alignment: { horizontal: 'right' } },
        currency: { numFmt: `"${selectedCurrency === 'INR' ? '₹' : '$'}"#,##0.00` },
        wrapped: { alignment: { wrapText: true, vertical: 'top' } },
        centered: { alignment: { horizontal: 'center', vertical: 'top' } }
    };

    const getUniqueSheetName = (baseName: string): string => {
        const sanitizedBaseName = baseName.replace(/[\\/?*[\]]/g, '');
        let name = sanitizedBaseName.substring(0, 31);
        if (!usedSheetNames.has(name)) {
            usedSheetNames.add(name);
            return name;
        }
        let i = 2;
        while (true) {
            const suffix = ` (${i})`;
            const truncatedName = sanitizedBaseName.substring(0, 31 - suffix.length);
            name = `${truncatedName}${suffix}`;
            if (!usedSheetNames.has(name)) {
                usedSheetNames.add(name);
                return name;
            }
            i++;
        }
    };

    const rates = await getExchangeRates();
    const rate = rates[selectedCurrency] || 1;
    const isINR = selectedCurrency === 'INR';
    const gstRate = 0.18; // 18% GST
    const sgstRate = 0.09;
    const cgstRate = 0.09;

    // --- 1. COVER & SUMMARY SHEET ---
    const summaryWs = XLSX.utils.aoa_to_sheet([]);
    const summaryData: any[][] = [];

    // Title Area
    summaryData.push([createStyledCell("Commercial Proposal", styles.title)]);
    summaryData.push([]);
    
    // Client & Project Info Table
    summaryData.push([createStyledCell("Project Details", styles.sectionHeader), "", "", createStyledCell("Contact Details", styles.sectionHeader)]);
    summaryData.push(["Project Name:", clientDetails.projectName, "", "Client Name:", clientDetails.clientName]);
    summaryData.push(["Location:", clientDetails.location, "", "Contact Person:", clientDetails.keyClientPersonnel]);
    summaryData.push(["Date:", clientDetails.date, "", "Design Engineer:", clientDetails.designEngineer]);
    summaryData.push(["", "", "", "Account Manager:", clientDetails.accountManager]);
    summaryData.push([]);

    // Proposal Summary Table Header
    const summaryHeaderRow = ["Sr. No", "Description", "Total Amount"];
    summaryData.push(summaryHeaderRow.map(h => createStyledCell(h, styles.header)));

    let projectGrandTotal = 0;
    let summaryIdx = 1;

    rooms.forEach((room) => {
        if (room.boq) {
            let roomTotal = 0;
            room.boq.forEach(item => {
                const itemMargin = typeof item.margin === 'number' ? item.margin : margin;
                const marginMult = 1 + itemMargin / 100;
                const baseTotal = item.totalPrice * rate * marginMult;
                const tax = baseTotal * gstRate;
                roomTotal += (baseTotal + tax);
            });
            projectGrandTotal += roomTotal;
            
            summaryData.push([
                createStyledCell(summaryIdx++, styles.centered),
                createStyledCell(room.name, styles.label),
                createStyledCell(roomTotal, { ...styles.total, ...styles.currency }, 'n')
            ]);
        }
    });

    // Grand Total Row
    summaryData.push([]);
    summaryData.push([
        "", 
        createStyledCell("Grand Total (Including Taxes)", styles.header), 
        createStyledCell(projectGrandTotal, { ...styles.header, ...styles.currency }, 'n')
    ]);

    // Add to Sheet
    XLSX.utils.sheet_add_aoa(summaryWs, summaryData, { origin: "A1" });
    summaryWs['!cols'] = [{ wch: 8 }, { wch: 50 }, { wch: 20 }, { wch: 20 }, { wch: 30 }];
    summaryWs['!merges'] = [
        { s: {r:0, c:0}, e: {r:0, c:4} }, // Title
        { s: {r:2, c:0}, e: {r:2, c:1} }, // Project Header
        { s: {r:2, c:3}, e: {r:2, c:4} }, // Contact Header
    ];
    XLSX.utils.book_append_sheet(wb, summaryWs, "Proposal Summary");


    // --- 2. TERMS & CONDITIONS SHEET ---
    const termsWs = XLSX.utils.aoa_to_sheet([]);
    let termsRow = 0;
    
    // Header
    XLSX.utils.sheet_add_aoa(termsWs, [[createStyledCell("Terms & Conditions / Scope of Work", styles.title)]], { origin: "A1" });
    termsRow += 2;

    Object.entries(companyTemplate.commercialTerms).forEach(([sectionTitle, items]) => {
        // Section Header
        XLSX.utils.sheet_add_aoa(termsWs, [[createStyledCell(sectionTitle, styles.sectionHeader)]], { origin: `A${termsRow + 1}` });
        termsWs["!merges"] = termsWs["!merges"] || [];
        termsWs["!merges"].push({ s: {r: termsRow, c: 0}, e: {r: termsRow, c: 1} });
        termsRow++;

        // Table Header
        if (items.length > 0) {
            const headers = items[0] as string[];
            const headerRow = headers.map(h => createStyledCell(h, styles.header));
            XLSX.utils.sheet_add_aoa(termsWs, [headerRow], { origin: `A${termsRow + 1}` });
            termsRow++;

            // Items
            const bodyItems = items.slice(1);
            bodyItems.forEach((row) => {
                const styledRow = row.map((cell, i) => createStyledCell(cell, i === 1 ? styles.wrapped : styles.centered));
                XLSX.utils.sheet_add_aoa(termsWs, [styledRow], { origin: `A${termsRow + 1}` });
                termsRow++;
            });
            termsRow++; // Spacer
        }
    });

    termsWs['!cols'] = [{ wch: 10 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(wb, termsWs, "Terms & Conditions");


    // --- 3. INDIVIDUAL ROOM SHEETS (BOQ) ---
    for (const room of rooms) {
        if (!room.boq) continue;

        const roomWs = XLSX.utils.aoa_to_sheet([]);
        const roomSheetName = getUniqueSheetName(room.name);

        // Room Header Info
        const infoData = [
            [createStyledCell(room.name, styles.title)],
            [],
            ["Room Type:", room.answers.roomType || "General"],
            ["Capacity:", room.answers.capacity || "N/A"],
            []
        ];
        XLSX.utils.sheet_add_aoa(roomWs, infoData, { origin: "A1" });
        let currentRow = 6;

        // BOQ Table Header
        // Matches PDF: Model No, Qty, Unit Rate, Total, SGST, CGST, Total Tax, Final
        const headers = [
            "Sr. No", 
            "Description of Goods / Services", 
            "Make", 
            "Model No", 
            "Qty", 
            `Unit Rate (${selectedCurrency})`, 
            `Total (${selectedCurrency})`
        ];

        if (isINR) {
            headers.push("SGST (9%)", "CGST (9%)");
        } else {
            headers.push("Tax (18%)");
        }
        headers.push(`Amount with Tax (${selectedCurrency})`);

        XLSX.utils.sheet_add_aoa(roomWs, [headers.map(h => createStyledCell(h, styles.header))], { origin: `A${currentRow}` });
        currentRow++;

        // --- Grouping Logic ---
        const groupedItems: Record<string, BoqItem[]> = {};
        if (viewMode === 'grouped') {
             // AVIXA Categories
             room.boq.forEach(item => {
                const cat = item.category || "Other";
                if (!groupedItems[cat]) groupedItems[cat] = [];
                groupedItems[cat].push(item);
             });
        } else {
            // Single Group for List View
            groupedItems["Bill of Quantities"] = room.boq;
        }

        // --- Render Items ---
        let srNo = 1;
        let sheetTotal = 0;

        Object.entries(groupedItems).forEach(([category, items]) => {
            if (viewMode === 'grouped') {
                XLSX.utils.sheet_add_aoa(roomWs, [[createStyledCell(category, styles.sectionHeader)]], { origin: `A${currentRow}` });
                roomWs["!merges"] = roomWs["!merges"] || [];
                roomWs["!merges"].push({ s: {r: currentRow - 1, c: 0}, e: {r: currentRow - 1, c: headers.length - 1} });
                currentRow++;
            }

            items.forEach(item => {
                const itemMargin = typeof item.margin === 'number' ? item.margin : margin;
                const marginMult = 1 + itemMargin / 100;
                
                const unitPrice = item.unitPrice * rate * marginMult;
                const basicTotal = unitPrice * item.quantity;
                
                let tax1 = 0, tax2 = 0;
                if (isINR) {
                    tax1 = basicTotal * sgstRate;
                    tax2 = basicTotal * cgstRate;
                } else {
                    tax1 = basicTotal * gstRate;
                }
                const totalTax = tax1 + tax2;
                const finalAmount = basicTotal + totalTax;
                sheetTotal += finalAmount;

                const rowData = [
                    createStyledCell(srNo++, styles.centered),
                    createStyledCell(item.itemDescription, styles.wrapped),
                    createStyledCell(item.brand, styles.centered),
                    createStyledCell(item.model, styles.centered),
                    createStyledCell(item.quantity, styles.centered, 'n'),
                    createStyledCell(unitPrice, styles.currency, 'n'),
                    createStyledCell(basicTotal, styles.currency, 'n'),
                ];

                if (isINR) {
                    rowData.push(createStyledCell(tax1, styles.currency, 'n'));
                    rowData.push(createStyledCell(tax2, styles.currency, 'n'));
                } else {
                    rowData.push(createStyledCell(tax1, styles.currency, 'n'));
                }
                rowData.push(createStyledCell(finalAmount, styles.currency, 'n'));

                XLSX.utils.sheet_add_aoa(roomWs, [rowData], { origin: `A${currentRow}` });
                currentRow++;
            });
        });

        // Totals Row
        currentRow++;
        const totalLabelCol = isINR ? 8 : 7; // Index of column before final amount
        const totalRow = new Array(headers.length).fill("");
        totalRow[totalLabelCol] = createStyledCell("Grand Total:", styles.total);
        totalRow[totalLabelCol + 1] = createStyledCell(sheetTotal, { ...styles.total, ...styles.currency }, 'n');
        
        XLSX.utils.sheet_add_aoa(roomWs, [totalRow], { origin: `A${currentRow}` });


        // Column Widths
        const colWidths = [
            { wch: 6 },  // Sr No
            { wch: 50 }, // Desc
            { wch: 15 }, // Make
            { wch: 20 }, // Model
            { wch: 6 },  // Qty
            { wch: 12 }, // Unit
            { wch: 15 }, // Total
            { wch: 12 }, // Tax 1
            { wch: 15 }, // Final / Tax 2
        ];
        if (isINR) colWidths.push({ wch: 15 }); // Extra col for Final
        
        roomWs['!cols'] = colWidths;
        
        XLSX.utils.book_append_sheet(wb, roomWs, roomSheetName);
    }

    XLSX.writeFile(wb, `${clientDetails.projectName || 'BOQ'}_AllWave_Format.xlsx`);
};
