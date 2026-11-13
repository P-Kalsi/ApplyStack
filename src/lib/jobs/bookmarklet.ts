// The "Send to ApplyStack" bookmark. When you click it on a job page, it reads
// the page you're looking at (the job's header and description if it can find
// them, your text selection if you made one, else the whole visible page) and
// opens ApplyStack's Add job page with it. The text travels in the URL's #
// fragment, which browsers never send to any server, and nothing is loaded
// from LinkedIn/Indeed: it only reads the page already on your screen.

const SOURCE = `(function(){
var A=__ORIGIN__;
function q(s){try{var e=document.querySelector(s);return e?(e.innerText||'').trim():''}catch(x){return ''}}
var sel=String(window.getSelection?window.getSelection():'').trim();
function first(list){for(var i=0;i<list.length;i++){var t=q(list[i]);if(t)return t;}return '';}
var head=first(['.job-details-jobs-unified-top-card__container--two-pane','.jobs-unified-top-card','.top-card-layout__entity-info','.jobsearch-JobInfoHeader-container','.jobsearch-HeaderContainer','h1']);
var co=first(['[data-testid="inlineHeader-companyName"]','[data-company-name]','.jobsearch-CompanyInfoContainer']);
var body=first(['#job-details','.jobs-description__content','.jobs-box__html-content','.description__text','#jobDescriptionText','[data-testid="jobDescriptionText"]']);
var text=sel.length>200?sel:[head,co&&head.indexOf(co)<0?co:'',body].filter(Boolean).join('\\n\\n');
if(!body&&sel.length<=200){text=(document.body&&document.body.innerText)||text;}
var d={u:location.href,t:document.title,x:text.slice(0,60000)};
var url=A+'/jobs/new#import='+encodeURIComponent(JSON.stringify(d));
var w=window.open(url,'_blank');if(!w){location.href=url;}
})();`;

/** Plain JavaScript of the bookmark (for tests). */
export function bookmarkletCode(origin: string): string {
  return SOURCE.replace("__ORIGIN__", JSON.stringify(origin.replace(/\/+$/, "")));
}

/** The href to drag into the bookmarks bar. */
export function bookmarkletHref(origin: string): string {
  return `javascript:${encodeURIComponent(bookmarkletCode(origin))}`;
}

export interface ImportFragment {
  u: string;
  t: string;
  x: string;
}

/** Read "#import=..." sent by the bookmark. */
export function parseImportFragment(hash: string): ImportFragment | null {
  const m = hash.match(/^#?import=(.*)$/s);
  if (!m) return null;
  try {
    const d = JSON.parse(decodeURIComponent(m[1])) as Partial<ImportFragment>;
    if (typeof d.x !== "string") return null;
    return { u: String(d.u ?? ""), t: String(d.t ?? ""), x: d.x };
  } catch {
    return null;
  }
}
