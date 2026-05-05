from __future__ import annotations

from flask import Flask

from .config import ChatdownConfig
from .db import close_db, init_db
from .routes.auth import auth_bp
from .routes.llm import llm_bp
from .routes.me import me_bp


def create_app(config: ChatdownConfig | None = None) -> Flask:
    app = Flask(__name__)
    app.config["CHATDOWN_CONFIG"] = config or ChatdownConfig.from_env()

    init_db(app)
    app.teardown_appcontext(close_db)

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(me_bp, url_prefix="/api")
    app.register_blueprint(llm_bp)

    @app.get("/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    return app
