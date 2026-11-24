import { createSampleMasterData } from '../src/data/sampleData.js';
import { generateTimetable } from '../src/engine/scheduler.js';
import { buildWorkbook } from '../src/utils/exportUtils.js';

async function run() {
  const masterData = createSampleMasterData();
  const scheduleResult = generateTimetable(masterData);
  const timetable = { sessions: scheduleResult.sessions, baseline: scheduleResult.sessions };

  console.log('Generating workbook via buildWorkbook...');
  const { workbook } = await buildWorkbook(masterData, timetable, {
    settings: {
      societyName: "K.E. Society's",
      instituteName: 'Rajarambapu Institute of Technology, Rajaramnagar',
      departmentName: 'Department of Robotics and Automation',
      termLabel: '2026-27 PART-1',
      revisionInfo: 'Revision No. 01 / Date 27/06/2026',
      academicYear: '2026–27',
      semester: 'Even Semester',
      wefDate: '2027-01-04',
      signatures: ['Timetable Incharge', 'HOD'],
    },
  });

  console.log('Worksheet count:', workbook.worksheets.length);
  workbook.worksheets.forEach((ws, idx) => {
    console.log(`[Sheet ${idx + 1}] "${ws.name}" - ${ws.columnCount} cols, ${ws.rowCount} rows, pageSetup paperSize=${ws.pageSetup?.paperSize}, orientation=${ws.pageSetup?.orientation}`);
  });

  // Verify Tab 1: Master Timetable (A3)
  const masterWs = workbook.getWorksheet('Master Timetable (A3)');
  if (!masterWs) throw new Error('Master Timetable (A3) sheet missing!');
  console.log('Master Timetable (A3) paperSize:', masterWs.pageSetup?.paperSize); // Expected 8 (A3)

  // Verify Division Tab
  const divWs = workbook.worksheets.find(w => w.name.includes('Timetable') && !w.name.includes('Master'));
  if (!divWs) throw new Error('Division timetable sheet missing!');
  console.log('Division sheet name:', divWs.name);
  console.log('Division columns count:', divWs.columns.length); // Expected 20
  console.log('Division A4 paperSize:', divWs.pageSetup?.paperSize); // Expected 9 (A4)
  console.log('Division Cell T1 (Revision):', divWs.getCell('T1').value);
  console.log('Division Cell A2 (Society):', divWs.getCell('A2').value);
  console.log('Division Cell A3 (Institute):', divWs.getCell('A3').value);

  // Verify Faculty Tab
  const facWs = workbook.worksheets.find(w => w.name.startsWith('Fac -'));
  if (!facWs) throw new Error('Faculty sheet missing!');
  console.log('Faculty sheet name:', facWs.name);
  console.log('Faculty columns count:', facWs.columns.length); // Expected 20
  console.log('Faculty A4 paperSize:', facWs.pageSetup?.paperSize); // Expected 9 (A4)
  console.log('Faculty Cell A7 (Staff):', facWs.getCell('A7').value);
  console.log('Faculty Cell A8 (FY):', facWs.getCell('A8').value);
  console.log('Faculty Cell S8 (Total):', facWs.getCell('S8').value);
  console.log('Faculty Cell T8 (Total hrs):', facWs.getCell('T8').value);

  // Save to test file
  await workbook.xlsx.writeFile('test-output.xlsx');
  console.log('SUCCESS! Workbook written to test-output.xlsx');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
