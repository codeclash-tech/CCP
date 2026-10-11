import { useState } from "react";
import { ArrowLeft, Check, FileText } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import "./Terms.css";

const TERMS = [
  {
    title: "1. Who may use CodeClash",
    paragraphs: [
      "You must be legally able to accept these terms and provide accurate account information. If you use CodeClash for an organization, you confirm that you are authorized to act for it. Do not create an account or participate if doing so would violate a law or restriction that applies to you.",
      "You are responsible for keeping your sign-in credentials private and for activity carried out through your account. Tell us promptly through AMUX if you believe your account has been accessed without permission.",
    ],
  },
  {
    title: "2. Accounts and email",
    paragraphs: [
      "An account requires a working email address and email verification. Keep your profile information current, use one account for yourself, and do not impersonate another person or organization. We may suspend access when an account appears compromised, fraudulent, or in breach of these terms.",
    ],
  },
  {
    title: "3. What CodeClash provides",
    paragraphs: [
      "CodeClash is an AMUX platform for creating and taking part in coding battles. Features may include question authoring, scheduled or timed rooms, code execution, submissions, scores, leaderboards, result reporting, and certificates. Features can change as the product develops; we will not describe a feature as available unless it is offered in the platform.",
      "Code execution and automated evaluation are provided for learning and challenge purposes. Results may be affected by test-case coverage, runtime conditions, or technical interruptions. Do not rely on a score or certificate as a formal qualification, hiring decision, or guarantee of skill.",
    ],
  },
  {
    title: "4. Battle creators and participants",
    paragraphs: [
      "Creators are responsible for the questions, instructions, schedules, access settings, and permissions for each battle they publish. Do not include confidential information, personal data, harmful material, or content you do not have the right to use. Creators must explain any rules that are specific to their battle and must not misrepresent how results are evaluated.",
      "Participants must follow the battle rules and use the platform honestly. Do not attempt to bypass time limits, access another participant's account or work, interfere with the judge or service, or use unauthorized assistance where a battle prohibits it. Creators may apply disclosed moderation rules, and CodeClash may review or restrict activity to protect the service.",
    ],
  },
  {
    title: "5. Your content and permissions",
    paragraphs: [
      "You retain ownership of content you submit, including questions, descriptions, code, organization names, and logos, subject to rights held by others. You grant AMUX a limited, non-exclusive permission to host, process, display, execute where applicable, and transmit that content as needed to operate and improve the features you use.",
      "You confirm that you have the rights and permissions needed to submit content and grant this permission. You are responsible for maintaining your own copies of content you need. Do not submit passwords, private keys, payment details, or other secrets as challenge content or code.",
    ],
  },
  {
    title: "6. Code execution, data, and privacy",
    paragraphs: [
      "Code and inputs submitted for execution are processed to run and evaluate your solution. Do not use the execution environment to attack systems, access data that is not yours, mine cryptocurrency, or run code unrelated to the battle. We may collect account, usage, submission, and diagnostic information to provide the service, calculate results, prevent abuse, and troubleshoot problems.",
      "Use of personal information is also subject to the privacy information made available by AMUX. Do not include personal or sensitive information about another person in battle content unless you have a lawful basis and the necessary permission.",
    ],
  },
  {
    title: "7. Organizations and partner program",
    paragraphs: [
      "An organization creator confirms they may represent the organization and use its name and logo. By opting into the partner program, they authorize AMUX to display the submitted organization name and logo in CodeClash's partner area and to identify the organization as a CodeClash partner.",
      "The partner program is intended to provide priority access to upcoming CodeClash features, reduced pricing for eligible future platform features, access to partner discounts on AMUX products, and priority handling for AMUX service requests. These benefits apply to future releases and offers and are subject to their published eligibility and availability; they do not guarantee that a particular feature, product, discount, or service will be offered. Any future offer may have separate duration and terms. A partner may contact AMUX to request removal from the public partner listing.",
    ],
  },
  {
    title: "8. Acceptable use",
    paragraphs: [
      "Do not use CodeClash to break laws, infringe intellectual-property or privacy rights, distribute malware, harass or threaten others, manipulate results, disrupt availability, probe or exploit vulnerabilities without authorization, or evade platform safeguards. Do not scrape, resell, or make the service available to others except as permitted by law and by AMUX.",
      "We may remove content, restrict a room, or suspend an account when reasonably necessary to enforce these rules, respond to a security or legal concern, or protect users and the service. Where practical, we will explain the action and provide a way to contact AMUX about it.",
    ],
  },
  {
    title: "9. Results, certificates, and room retention",
    paragraphs: [
      "Scores, rankings, and certificates are generated from the information available to the platform and are not guaranteed to be error-free or permanently available. After a battle ends, its room and associated room data may be deleted after the retention period shown in the platform or in the result email. Download any result or certificate promptly and keep your own copy.",
    ],
  },
  {
    title: "10. Intellectual property and feedback",
    paragraphs: [
      "CodeClash, its software, branding, and platform materials are owned by AMUX or its licensors. These terms give you permission to use the platform for its intended purpose; they do not transfer ownership of the platform or grant rights to AMUX branding beyond that use. If you send suggestions, you allow AMUX to use them without restriction or payment, provided this does not transfer ownership of your submitted content.",
    ],
  },
  {
    title: "11. Availability and service changes",
    paragraphs: [
      "We work to keep CodeClash useful and available but do not promise uninterrupted access, error-free operation, or permanent storage. Maintenance, outages, third-party services, security events, or product changes can affect access. We may add, change, pause, or retire features, and may provide notice when a change materially affects how you use the platform.",
    ],
  },
  {
    title: "12. Disclaimers and responsibility",
    paragraphs: [
      "To the extent permitted by applicable law, CodeClash is provided on an “as available” basis without warranties that the service will meet every user's needs or that every result will be accurate. Nothing in these terms excludes a right or remedy that cannot legally be excluded.",
      "You are responsible for your content, your use of the platform, and your compliance with these terms. To the extent permitted by law, AMUX is not responsible for indirect or consequential loss arising from your use of CodeClash. Any liability that cannot be excluded is limited only to the extent applicable law permits.",
    ],
  },
  {
    title: "13. Suspension and account closure",
    paragraphs: [
      "You may stop using CodeClash at any time. AMUX may suspend or close access for a serious or repeated breach, a security risk, a legal requirement, or when needed to protect the service. Where practical, we will give notice and an opportunity to address the issue. Provisions that by their nature should continue, including content permissions needed for previously generated results and limitations permitted by law, survive closure.",
    ],
  },
  {
    title: "14. Changes to these terms",
    paragraphs: [
      "We may update these terms as the service changes or to meet legal requirements. We will update the date below when we do. If a change materially affects users, we will take reasonable steps to make the change visible. Continued use after updated terms take effect means you accept the revised terms; if you do not agree, stop using CodeClash.",
    ],
  },
  {
    title: "15. Governing law and contact",
    paragraphs: [
      "These terms are governed by the laws that apply to AMUX and the user, without removing any mandatory consumer protections. If a provision is unenforceable, the remaining provisions continue to apply to the extent permitted by law. For questions or concerns about CodeClash or these terms, contact AMUX through amux.in.",
    ],
  },
];

export default function Terms() {
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);

  return (
    <main className="terms-page">
      <Link className="terms-back-link" to="/register">
        <ArrowLeft size={15} /> Back to registration
      </Link>
      <header className="terms-header">
        <span className="about-eyebrow"><FileText size={15} /> CodeClash</span>
        <h1>Terms and Conditions</h1>
        <p>Effective date: October 11, 2026</p>
        <p className="terms-intro">
          These terms explain the rules for using CodeClash, a coding challenge
          platform provided by AMUX. Please read them before creating an
          account.
        </p>
      </header>

      <div className="terms-content">
        {TERMS.map((section) => (
          <section key={section.title} className="terms-section">
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </div>

      <section className="terms-agreement">
        <label>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          <span>I have read and agree to the CodeClash Terms and Conditions.</span>
        </label>
        <button
          className="btn-primary"
          type="button"
          disabled={!agreed}
          onClick={() =>
            navigate("/register", {
              replace: true,
              state: { termsAccepted: true },
            })
          }
        >
          <Check size={16} /> Agree and continue to registration
        </button>
      </section>
    </main>
  );
}
