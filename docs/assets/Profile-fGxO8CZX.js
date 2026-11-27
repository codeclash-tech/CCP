import{o as e,r as t,t as n}from"./jsx-runtime-B8EBQspR.js";import{t as r}from"./check-BJqUOLpb.js";import{t as i}from"./loader-circle-B72XUzbq.js";import{t as a}from"./mail-BmCdNAv5.js";import{t as o}from"./pencil-Cza9cQJL.js";import{t as s}from"./shield-check-BcxDww3o.js";import{t as c}from"./x-BKwkYhUD.js";import{t as l}from"./api-CX5zGd-d.js";import{g as u,h as d,i as f,l as p}from"./index-oZJ9aelt.js";var m=e(t(),1),h=n();function g({name:e,size:t=34,title:n}){let r=Array.from(String(e||``).trim())[0]?.toLocaleUpperCase();return(0,h.jsx)(`span`,{"aria-label":n||e||`User`,title:n||e||`User`,style:{width:t,height:t,minWidth:t,borderRadius:`50%`,display:`inline-flex`,alignItems:`center`,justifyContent:`center`,background:`var(--accent-blue-soft)`,border:`1px solid var(--accent-blue)`,color:`var(--accent-blue-bright)`,fontSize:Math.max(12,Math.round(t*.44)),fontWeight:700,lineHeight:1,userSelect:`none`},children:r||`?`})}function _(){let{user:e,updateUser:t}=f(),[n,_]=(0,m.useState)(!1),[v,y]=(0,m.useState)(!1),[b,x]=(0,m.useState)(``),[S,C]=(0,m.useState)(``),[w,T]=(0,m.useState)(e?.name||``),[E,D]=(0,m.useState)(e?.organization||``),[O,k]=(0,m.useState)(null),A=!!e?.isVerified,j=e?.creatorType===`ORGANIZATION`&&e?.role!==`ADMIN`,M=O?.name||(e?.organization&&e.organization!==`Unspecified`?e.organization:``);return(0,m.useEffect)(()=>{T(e?.name||``),D(e?.organization||``)},[e?.name,e?.organization]),(0,m.useEffect)(()=>{if(!j){k(null);return}l.get(`/weekly-assessments/organization/profile`).then(({data:e})=>{k(e.organization||null),e.organization?.name&&D(e.organization.name)}).catch(e=>{if(e.response?.status===404){k(null);return}x(e.message||`Could not load your profile.`)})},[j]),(0,h.jsxs)(`main`,{className:`profile-page`,children:[(0,h.jsx)(`style`,{children:`
        .profile-page {
          width: 100%;
          margin: 0 auto;
          min-height: calc(100vh - 64px);
          padding: 20px var(--page-gutter) 48px;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          color: var(--text-primary);
          box-sizing: border-box;
        }

        .profile-container {
          width: min(100%, 720px);
          margin: 0 auto;
        }

        /* Single premium card */
        .profile-card {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(56, 189, 248, 0.28);
          border-radius: 20px;
          background:
            radial-gradient(ellipse at 88% -10%, rgba(56, 189, 248, 0.16), transparent 55%),
            linear-gradient(160deg, rgba(15, 30, 58, 0.5), var(--bg-elevated));
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.35);
        }

        .profile-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #38bdf8, transparent);
          opacity: 0.7;
        }

        .profile-hero {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding: 30px 32px 26px;
          border-bottom: 1px solid var(--border-color);
        }

        .profile-identity {
          display: flex;
          align-items: center;
          gap: 18px;
          min-width: 0;
        }

        .profile-avatar {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .profile-name {
          margin: 0;
          color: var(--text-primary);
          font-size: 24px;
          line-height: 1.25;
          font-weight: 800;
          letter-spacing: -0.02em;
          overflow-wrap: anywhere;
        }

        .profile-email {
          margin: 5px 0 0;
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.4;
          overflow-wrap: anywhere;
        }

        .profile-status {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 12px;
          border: 1px solid rgba(34, 197, 94, 0.2);
          border-radius: 999px;
          background: rgba(34, 197, 94, 0.08);
          color: var(--color-success);
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
        }

        .profile-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
        }

        .profile-content {
          padding: 24px 32px 30px;
        }

        .profile-details {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin: 0;
        }

        .profile-detail {
          min-width: 0;
          padding: 15px 16px;
          border: 1px solid var(--border-color);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.015);
        }

        .profile-detail dt {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin: 0 0 8px;
          color: var(--text-muted);
          font-size: 11px;
          line-height: 1.3;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }

        .profile-detail dt svg {
          color: var(--accent-blue-bright, #38bdf8);
        }

        .profile-detail dd {
          margin: 0;
          color: var(--text-primary);
          font-size: 13px;
          line-height: 1.45;
          font-weight: 500;
          overflow-wrap: anywhere;
        }

        .profile-role {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          padding: 4px 10px;
          border-radius: 100px;
          background: rgba(56, 189, 248, 0.1);
          border: 1px solid rgba(56, 189, 248, 0.3);
          color: var(--text-primary);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .profile-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-top: 22px;
          padding-top: 18px;
          border-top: 1px solid var(--border-color);
        }

        .profile-footer-text {
          margin: 0;
          color: var(--text-muted);
          font-size: 11px;
          line-height: 1.5;
        }

        .profile-footer-mark {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          opacity: 0.8;
        }

        .profile-edit-form {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin-top: 22px;
          padding-top: 20px;
          border-top: 1px solid var(--border-color);
        }

        .profile-edit-field {
          display: grid;
          gap: 7px;
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.065em;
        }

        .profile-edit-field input {
          width: 100%;
          min-height: 42px;
          padding: 9px 11px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-main);
          color: var(--text-primary);
          font: 14px var(--font-ui);
          text-transform: none;
          letter-spacing: normal;
        }

        .profile-edit-actions {
          display: flex;
          grid-column: 1 / -1;
          justify-content: flex-end;
          gap: 9px;
        }

        .profile-edit-feedback {
          grid-column: 1 / -1;
          font-size: 13px;
        }

        .profile-edit-feedback.error {
          color: var(--color-danger);
        }

        .profile-edit-feedback.success {
          color: var(--color-success);
        }

        .profile-saving-icon {
          animation: profile-spin 1s linear infinite;
        }

        @keyframes profile-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 680px) {
          .profile-page {
            padding: 24px 16px 40px;
          }

          .profile-hero {
            align-items: flex-start;
            flex-direction: column;
            padding: 22px;
            gap: 16px;
          }

          .profile-content {
            padding: 22px;
          }

          .profile-edit-form {
            grid-template-columns: 1fr;
          }

          .profile-edit-actions,
          .profile-edit-feedback {
            grid-column: auto;
          }

          .profile-details {
            grid-template-columns: 1fr;
          }

          .profile-footer {
            align-items: flex-start;
            flex-direction: column;
          }
        }

        @media (max-width: 420px) {
          .profile-identity {
            gap: 12px;
          }

          .profile-name {
            font-size: 19px;
          }
        }
      `}),(0,h.jsx)(`div`,{className:`profile-container`,children:(0,h.jsxs)(`section`,{className:`profile-card`,children:[(0,h.jsxs)(`div`,{className:`profile-hero`,children:[(0,h.jsxs)(`div`,{className:`profile-identity`,children:[(0,h.jsx)(`div`,{className:`profile-avatar`,children:(0,h.jsx)(g,{name:e?.name,size:64})}),(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`h2`,{className:`profile-name`,children:e?.name||`Your profile`}),(0,h.jsx)(`p`,{className:`profile-email`,children:e?.email||`No email available`}),(0,h.jsx)(`span`,{className:`profile-role`,style:{marginTop:8},children:e?.role===`ADMIN`?`Super Admin`:j?`Primary Admin`:`Participant`})]})]}),(0,h.jsxs)(`div`,{className:`profile-status`,children:[(0,h.jsx)(`span`,{className:`profile-status-dot`}),A?`Verified account`:`Unverified account`]})]}),(0,h.jsxs)(`div`,{className:`profile-content`,children:[(0,h.jsxs)(`dl`,{className:`profile-details`,children:[(0,h.jsxs)(`div`,{className:`profile-detail`,children:[(0,h.jsxs)(`dt`,{children:[(0,h.jsx)(a,{size:13}),` Email`]}),(0,h.jsx)(`dd`,{children:e?.email||`—`})]}),(0,h.jsxs)(`div`,{className:`profile-detail`,children:[(0,h.jsxs)(`dt`,{children:[(0,h.jsx)(u,{size:13}),` Organization`]}),(0,h.jsx)(`dd`,{children:M||`Not set`})]}),(0,h.jsxs)(`div`,{className:`profile-detail`,children:[(0,h.jsxs)(`dt`,{children:[(0,h.jsx)(d,{size:13}),` Member since`]}),(0,h.jsx)(`dd`,{children:e?.createdAt?new Date(e.createdAt).toLocaleDateString():`—`})]})]}),S&&!n&&(0,h.jsx)(`p`,{className:`profile-edit-feedback success`,role:`status`,children:S}),n?(0,h.jsxs)(`form`,{className:`profile-edit-form`,onSubmit:async e=>{e.preventDefault(),x(``),C(``);let n=w.trim(),r=E.trim();if(!n||n.length>100){x(`Enter a name between 1 and 100 characters.`);return}if(j&&!r){x(`Enter your organization name.`);return}if(r.length>120){x(`Organization must be 120 characters or fewer.`);return}y(!0);try{if(j){let{data:e}=await l.request({method:O?`put`:`post`,url:`/weekly-assessments/organization/profile`,data:{name:r}});k(e.organization)}let e=await p({name:n,organization:r});t(e),C(`Your profile has been updated.`),_(!1)}catch(e){x(e.message||`Failed to update your profile.`)}finally{y(!1)}},children:[(0,h.jsxs)(`label`,{className:`profile-edit-field`,children:[`Name`,(0,h.jsx)(`input`,{autoComplete:`name`,maxLength:100,required:!0,value:w,onChange:e=>T(e.target.value)})]}),(0,h.jsxs)(`label`,{className:`profile-edit-field`,children:[`Organization (optional)`,(0,h.jsx)(`input`,{autoComplete:`organization`,maxLength:120,value:E,onChange:e=>D(e.target.value)})]}),b&&(0,h.jsx)(`p`,{className:`profile-edit-feedback error`,role:`alert`,children:b}),(0,h.jsxs)(`div`,{className:`profile-edit-actions`,children:[(0,h.jsxs)(`button`,{className:`btn-secondary`,type:`button`,onClick:()=>{T(e?.name||``),D(e?.organization||``),x(``),C(``),_(!1)},disabled:v,children:[(0,h.jsx)(c,{size:14}),`Cancel`]}),(0,h.jsxs)(`button`,{className:`btn-primary`,type:`submit`,disabled:v,children:[v?(0,h.jsx)(i,{size:14,className:`profile-saving-icon`}):(0,h.jsx)(r,{size:14}),v?`Saving...`:`Save changes`]})]})]}):(0,h.jsxs)(`div`,{className:`profile-edit-actions`,style:{marginTop:20,justifyContent:`flex-start`},children:[(0,h.jsxs)(`button`,{className:`btn-secondary`,type:`button`,onClick:()=>{x(``),C(``),_(!0)},children:[(0,h.jsx)(o,{size:14}),`Edit profile`]}),b&&!n&&(0,h.jsx)(`p`,{className:`profile-edit-feedback error`,role:`alert`,children:b})]}),(0,h.jsxs)(`div`,{className:`profile-footer`,children:[(0,h.jsx)(`p`,{className:`profile-footer-text`,children:`Your account information is displayed here based on your current account details.`}),(0,h.jsxs)(`span`,{className:`profile-footer-mark`,children:[(0,h.jsx)(s,{size:13}),` AMUX ACCOUNT`]})]})]})]})})]})}export{_ as default};