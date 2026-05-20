import { PageBackButton } from "./PageBackButton";

export function AdminPageHeader({ title, description, children, backTo }) {
  return (
    <header className="admin-page-header page-header-with-back">
      <div className="page-header__lead">
        <PageBackButton to={backTo} />
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {children ? <div className="page-header__actions">{children}</div> : null}
    </header>
  );
}
