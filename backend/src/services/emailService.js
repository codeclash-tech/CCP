import { BREVO_SENDER, getBrevoClient } from "./brevoClient.js";

export async function sendBattleRoomResultEmail({
  email,
  userName,
  roomTitle,
  totalScore,
  totalPassed,
  totalTestCases,
  codingBehavior,
  rank,
  totalParticipants,
  roomCode,
  certificateUrl,
  completedAt,
}) {
  try {
    const brevo = getBrevoClient();

    const passRate =
      totalTestCases > 0 ? Math.round((totalPassed / totalTestCases) * 100) : 0;
    const codingStyle = getCodingStyleDescription(codingBehavior);
    const safeUserName = escapeHtml(userName || "Developer");
    const safeRoomTitle = escapeHtml(roomTitle || "Coding Challenge");
    const safeRoomCode = escapeHtml(roomCode || "");
    const completionDate = new Date(completedAt || Date.now()).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    // Certificate block mimicking the React Canvas UI exactly, followed by a professional LinkedIn-style summary
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f3f2ef; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  
  <!-- ============================================== -->
  <!-- CERTIFICATE SECTION (KEPT EXACTLY AS REQUESTED)-->
  <!-- ============================================== -->
  <div style="background: linear-gradient(135deg, #07142f 0%, #123b8f 50%, #2563eb 100%); background-color: #123b8f; padding: 40px 15px;">
    <!-- Main Card -->
    <div style="background-color: #ffffff; border-radius: 20px; padding: 22px; max-width: 800px; margin: 0 auto; box-shadow: 0 20px 40px rgba(0,0,0,0.4);">
      
      <!-- Inner Blue Border -->
      <div style="border: 2px solid #2563eb; border-radius: 10px; padding: 40px 30px; position: relative;">
        
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 30px;">
          <tr>
            <td align="left" valign="top">
              <h1 style="color: #1d4ed8; font-family: Georgia, 'Times New Roman', serif; font-size: 38px; margin: 0 0 8px 0;">CodeClash</h1>
              <p style="color: #64748b; font-size: 12px; font-weight: 600; letter-spacing: 2px; margin: 0 0 14px 0;">CERTIFICATE OF EXCELLENCE</p>
              
              <!-- Decorative Blue Line -->
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width: 32px; height: 4px; background-color: #2563eb;"></td>
                  <td style="width: 213px; height: 2px; background-color: #2563eb;"></td>
                </tr>
              </table>
            </td>
            
            <td align="right" valign="top" style="width: 80px;">
              <!-- Corner Bracket Graphic -->
              <div style="width: 50px; height: 50px; border-top: 2px solid #2563eb; border-right: 2px solid #2563eb; float: right;"></div>
            </td>
          </tr>
        </table>

        <!-- Body -->
        <div style="text-align: center; margin-bottom: 30px;">
          <p style="color: #94a3b8; font-family: Georgia, 'Times New Roman', serif; font-size: 18px; margin: 0 0 25px 0;">This certificate is proudly presented to</p>
          
          <h2 style="color: #0f172a; font-family: Georgia, 'Times New Roman', serif; font-size: 42px; font-weight: bold; margin: 0 0 10px 0; text-transform: uppercase;">${safeUserName}</h2>
          <div style="width: 300px; height: 1px; background-color: #2563eb; margin: 0 auto 30px auto;"></div>
          
          <p style="color: #64748b; font-size: 17px; margin: 0 0 10px 0;">For successfully competing in the coding battle</p>
          
          <h3 style="color: #1e293b; font-family: Georgia, 'Times New Roman', serif; font-size: 28px; font-weight: bold; margin: 0 0 20px 0;">${safeRoomTitle}</h3>
          
          <p style="color: #64748b; font-size: 16px; margin: 0; line-height: 1.5;">In recognition of your dedication, technical ability and commitment<br>demonstrated throughout the challenge.</p>
          <p style="color: #1d4ed8; font-size: 18px; font-weight: bold; margin: 24px 0 0 0;">FINAL RANK #${rank} OF ${totalParticipants}</p>
        </div>

        <hr style="border: none; border-top: 1px solid #c9c6c6; margin: 30px 0;">

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
          <tr>
            <td align="left" valign="bottom" style="width: 50%;">
              <p style="color: #0f172a; font-weight: bold; font-size: 14px; margin: 0 0 5px 0;">${completionDate}</p>
              <p style="color: #64748b; font-size: 10px; margin: 0;">DATE OF COMPLETION</p>
            </td>
            <td align="right" valign="bottom" style="width: 50%;">
              <p style="color: #0f172a; font-family: 'Brush Script MT', 'Segoe Script', cursive, Georgia; font-size: 23px; font-style: italic; margin: 0 0 5px 0;">CodeClash Team</p>
              <div style="width: 170px; height: 1px; background-color: #94a3b8; float: right; margin-bottom: 5px;"></div>
              <div style="clear: both;"></div>
              <p style="color: #64748b; font-size: 10px; margin: 0;">VERIFIED SYSTEM</p>
            </td>
          </tr>
        </table>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">

        <div style="text-align: center;">
          <p style="color: #94a3b8; font-family: 'Courier New', monospace; font-size: 13px; margin: 0;">CODECLASH • COMPETE • CODE • CONQUER</p>
        </div>

      </div>
    </div>
  </div>

  <!-- ============================================== -->
  <!-- STATS & BATTLE SUMMARY (LINKEDIN PROFESSIONAL) -->
  <!-- ============================================== -->
  <div style="padding: 40px 15px; background-color: #f3f2ef;">
    <div style="max-width: 800px; margin: 0 auto; background: #ffffff; border: 1px solid #dce0e3; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      
      <!-- Stats Header -->
      <div style="background-color: #ffffff; padding: 32px 32px 20px 32px; border-bottom: 1px solid #ebebeb;">
        <h2 style="color: #191919; font-size: 24px; margin: 0 0 8px; font-weight: 600;">Performance Summary: ${safeRoomTitle}</h2>
        <p style="color: #666666; font-size: 16px; margin: 0;">You finished rank #${rank} out of ${totalParticipants} participants</p>
      </div>
      
      <!-- Stats Content -->
      <div style="padding: 32px;">
        <p style="color: #191919; font-size: 16px; margin: 0 0 24px 0;">Dear ${safeUserName},</p>
        <p style="color: #666666; font-size: 16px; line-height: 1.5; margin: 0 0 32px 0;">The assessment has concluded. Below is a detailed overview of your technical performance metrics.</p>
        
        <!-- Stats Grid via Table -->
        <table width="100%" cellpadding="0" cellspacing="15" border="0" style="margin-bottom: 32px; margin-left: -15px; width: calc(100% + 30px);">
          <tr>
            <td style="background: #f8f9fa; border: 1px solid #e1e5e8; border-radius: 8px; padding: 24px; text-align: center; width: 50%;">
              <div style="color: #666666; font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 1px; margin-bottom: 8px;">Total Score</div>
              <div style="color: #0a66c2; font-size: 32px; font-weight: bold;">${Math.round(totalScore)}</div>
            </td>
            <td style="background: #f8f9fa; border: 1px solid #e1e5e8; border-radius: 8px; padding: 24px; text-align: center; width: 50%;">
              <div style="color: #666666; font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 1px; margin-bottom: 8px;">Pass Rate</div>
              <div style="color: #0a66c2; font-size: 32px; font-weight: bold;">${passRate}%</div>
            </td>
          </tr>
          <tr>
            <td style="background: #f8f9fa; border: 1px solid #e1e5e8; border-radius: 8px; padding: 24px; text-align: center; width: 50%;">
              <div style="color: #666666; font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 1px; margin-bottom: 8px;">Tests Passed</div>
              <div style="color: #0a66c2; font-size: 28px; font-weight: bold;">${totalPassed} / ${totalTestCases}</div>
            </td>
            <td style="background: #f8f9fa; border: 1px solid #e1e5e8; border-radius: 8px; padding: 24px; text-align: center; width: 50%;">
              <div style="color: #666666; font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 1px; margin-bottom: 8px;">Final Rank</div>
              <div style="color: #0a66c2; font-size: 28px; font-weight: bold;">#${rank}</div>
            </td>
          </tr>
        </table>

        <!-- Badge -->
        <div style="display: inline-block; background: #e8f3fd; color: #0a66c2; padding: 8px 16px; border-radius: 4px; font-size: 14px; font-weight: 600; margin-bottom: 24px; border: 1px solid #bcdcfa;">
          Verified Original Author (Non-AI Coder)
        </div>

        <!-- Coding Style -->
        <div style="background: #ffffff; border: 1px solid #e1e5e8; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
          <div style="color: #191919; font-size: 16px; font-weight: 600; margin-bottom: 12px;">Coding Analysis</div>
          <div style="color: #666666; font-size: 15px; line-height: 1.6;">${codingStyle}</div>
        </div>

        <!-- Room Code -->
        <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #ebebeb;">
          <p style="color: #666666; font-size: 14px; margin-bottom: 8px;">Assessment Reference Code</p>
          <p style="color: #191919; font-size: 18px; font-weight: bold; font-family: monospace; letter-spacing: 2px; margin: 0;">${safeRoomCode}</p>
        </div>
        
        <!-- Certificate Download CTA -->
        ${
          certificateUrl
            ? `
        <div style="margin-top: 32px;">
          <a href="${escapeHtml(certificateUrl)}" style="display: inline-block; background: #0a66c2; color: #ffffff; padding: 12px 24px; border-radius: 24px; text-decoration: none; font-weight: 600; font-size: 15px; transition: background 0.2s;">
            Download PDF Certificate
          </a>
        </div>`
            : ""
        }

      </div>
    </div>
    
    <!-- Email Footer -->
    <div style="text-align: center; margin-top: 24px;">
      <p style="color: #8c8c8c; font-size: 12px; margin: 0 0 4px 0;">CodeClash Technical Assessments &copy; ${new Date().getFullYear()}</p>
      <p style="color: #8c8c8c; font-size: 12px; margin: 0;">Share your verified achievement on LinkedIn</p>
    </div>
  </div>
</body>
</html>`;

    const textContent = `
PERFORMANCE SUMMARY: ${roomTitle}
You finished rank #${rank} out of ${totalParticipants} participants.

Dear ${userName},

The assessment has concluded. Below is a detailed overview of your technical performance metrics:

Total Score: ${Math.round(totalScore)}
Pass Rate: ${passRate}%
Tests Passed: ${totalPassed} / ${totalTestCases}
Final Rank: #${rank}

Verified Original Author (Non-AI Coder)

Coding Analysis:
${codingStyle}

Assessment Reference Code: ${roomCode}

${certificateUrl ? `Download your certificate (PDF): ${certificateUrl}` : ""}

Share your verified achievement on LinkedIn.
CodeClash Technical Assessments
    `;

    const response = await brevo.transactionalEmails.sendTransacEmail({
      sender: BREVO_SENDER,
      to: [{ email }],
      subject: `Assessment Complete: ${roomTitle} - Performance Summary`,
      textContent,
      htmlContent,
    });

    console.log(
      `[EmailService] Result email sent to ${email}: ${response?.messageId || "unknown"}`,
    );
    return { success: true, messageId: response?.messageId };
  } catch (error) {
    console.error(
      `[EmailService] Failed to send email to ${email}:`,
      error.message,
    );
    return { success: false, error: error.message };
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getCodingStyleDescription(behavior) {
  if (!behavior)
    return "You successfully completed the assessment and submitted your technical solutions.";

  const parts = [];
  const totalLines = behavior.totalLinesWritten || 0;
  const totalEdits = behavior.totalEdits || 0;
  const timePerQuestion = behavior.timePerQuestion || 0;
  const editFrequency = behavior.editFrequency || 0;
  const completedEarly = behavior.completedEarly || false;

  if (totalLines > 0) {
    if (totalLines > 200) {
      parts.push(
        "Demonstrated ability to write comprehensive, structurally sound code with attention to detail.",
      );
    } else if (totalLines > 100) {
      parts.push(
        "Produced clean, maintainable logic that directly addresses the problem requirements.",
      );
    } else {
      parts.push(
        "Utilized a concise and highly efficient approach to problem-solving.",
      );
    }
  }

  if (editFrequency > 0) {
    if (editFrequency > 10) {
      parts.push(
        "Showed an iterative development style, continuously refining the approach.",
      );
    } else if (editFrequency > 5) {
      parts.push(
        "Maintained a consistent execution pace, balancing initial thought process with active coding.",
      );
    } else {
      parts.push(
        "Exhibited strong upfront planning and logical mapping prior to implementation.",
      );
    }
  }

  if (timePerQuestion > 0) {
    if (timePerQuestion < 300) {
      parts.push(
        "Resolved problems rapidly, indicating strong familiarity with core algorithms.",
      );
    } else if (timePerQuestion < 900) {
      parts.push(
        "Applied a measured, methodical framework to reach successful solutions.",
      );
    } else {
      parts.push(
        "Demonstrated a thorough and deeply analytical process to ensure accuracy.",
      );
    }
  }

  if (completedEarly) {
    parts.push(
      "Completed the required modules well ahead of the allotted timeframe.",
    );
  }

  if (parts.length === 0) {
    return "You successfully completed the assessment and submitted your technical solutions.";
  }

  return parts.join(" ");
}

export default {
  sendBattleRoomResultEmail,
};
