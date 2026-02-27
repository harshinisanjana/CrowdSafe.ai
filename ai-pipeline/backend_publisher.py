"""
backend_publisher.py
--------------------
Sends structured crowd analysis JSON to downstream consumers.

Supports two transport modes:
  - Mode A ("fastapi"):  HTTP POST to a FastAPI endpoint.
  - Mode B ("rabbitmq"): Publish to a RabbitMQ exchange via pika.
  - Mode   ("both"):     Send to both simultaneously.

Usage:
    publisher = BackendPublisher(mode="fastapi")
    publisher.send(crowd_data)
"""

import json
import logging
import time
from typing import Any, Dict, Literal

import requests
import pika
import pika.exceptions

import config

logger = logging.getLogger("backend_publisher")
logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")


class BackendPublisher:
    """Publishes crowd analysis payloads to FastAPI and/or RabbitMQ."""

    def __init__(
        self,
        mode: Literal["fastapi", "rabbitmq", "both"] = config.PUBLISHER_MODE,
        fastapi_url: str    = config.FASTAPI_URL,
        fastapi_timeout: int = config.FASTAPI_TIMEOUT,
        rabbitmq_host: str  = config.RABBITMQ_HOST,
        rabbitmq_port: int  = config.RABBITMQ_PORT,
        rabbitmq_exchange: str = config.RABBITMQ_EXCHANGE,
        rabbitmq_routing: str  = config.RABBITMQ_ROUTING,
    ) -> None:
        """
        Args:
            mode:             Transport mode – "fastapi" | "rabbitmq" | "both".
            fastapi_url:      Full URL of the FastAPI POST endpoint.
            fastapi_timeout:  Request timeout in seconds.
            rabbitmq_host:    RabbitMQ broker hostname.
            rabbitmq_port:    RabbitMQ broker port (default 5672).
            rabbitmq_exchange: Exchange name to publish to.
            rabbitmq_routing:  Routing key for the message.
        """
        self.mode              = mode
        self.fastapi_url       = fastapi_url
        self.fastapi_timeout   = fastapi_timeout
        self.rabbitmq_host     = rabbitmq_host
        self.rabbitmq_port     = rabbitmq_port
        self.rabbitmq_exchange = rabbitmq_exchange
        self.rabbitmq_routing  = rabbitmq_routing

        # Lazy RabbitMQ connection (created on first use)
        self._rmq_connection: pika.BlockingConnection | None = None
        self._rmq_channel: pika.channel.Channel | None = None

        logger.info(f"Publisher initialised in mode='{mode}'")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def send(self, data: Dict[str, Any]) -> None:
        """
        Dispatch crowd analysis data according to the configured mode.

        Args:
            data: Structured crowd analysis dict (JSON-serialisable).
        """
        if self.mode == "none":
            return  # Silent mode – used for local testing without a backend

        if self.mode in ("fastapi", "both"):
            self.send_to_fastapi(data)

        if self.mode in ("rabbitmq", "both"):
            self.send_to_rabbitmq(data)

    def send_to_fastapi(
        self, data: Dict[str, Any], retries: int = 2
    ) -> bool:
        """
        POST crowd data to the FastAPI backend.

        Args:
            data:    JSON-serialisable crowd analysis dict.
            retries: Number of retry attempts on connection failure.

        Returns:
            True if the request succeeded (2xx), False otherwise.
        """
        for attempt in range(1, retries + 2):
            try:
                response = requests.post(
                    self.fastapi_url,
                    json=data,
                    timeout=self.fastapi_timeout,
                )
                if response.ok:
                    logger.info(
                        f"[FastAPI] Published OK – status {response.status_code}"
                    )
                    return True
                else:
                    logger.warning(
                        f"[FastAPI] Server returned {response.status_code}: {response.text[:120]}"
                    )
            except requests.exceptions.ConnectionError:
                logger.warning(
                    f"[FastAPI] Connection refused (attempt {attempt}/{retries + 1}). "
                    "Is the Node/FastAPI backend running?"
                )
            except requests.exceptions.Timeout:
                logger.warning(f"[FastAPI] Request timed out (attempt {attempt})")
            except Exception as exc:
                logger.error(f"[FastAPI] Unexpected error: {exc}")
                break

            if attempt <= retries:
                time.sleep(0.5 * attempt)

        return False

    def send_to_rabbitmq(self, data: Dict[str, Any]) -> bool:
        """
        Publish crowd data to a RabbitMQ exchange.

        Uses a lazy-initialised persistent connection. If the connection
        has been lost, it attempts to reconnect once.

        Args:
            data: JSON-serialisable crowd analysis dict.

        Returns:
            True on success, False on failure.
        """
        try:
            channel = self._get_rmq_channel()
            body = json.dumps(data, ensure_ascii=False)
            channel.basic_publish(
                exchange=self.rabbitmq_exchange,
                routing_key=self.rabbitmq_routing,
                body=body,
                properties=pika.BasicProperties(
                    content_type="application/json",
                    delivery_mode=2,  # persistent message
                ),
            )
            logger.info(
                f"[RabbitMQ] Published to exchange='{self.rabbitmq_exchange}' "
                f"routing='{self.rabbitmq_routing}'"
            )
            return True

        except (pika.exceptions.AMQPConnectionError,
                pika.exceptions.AMQPChannelError,
                pika.exceptions.StreamLostError) as exc:
            logger.warning(f"[RabbitMQ] Connection lost ({exc}), resetting...")
            self._reset_rmq()

        except Exception as exc:
            logger.error(f"[RabbitMQ] Unexpected error: {exc}")

        return False

    def close(self) -> None:
        """Cleanly close any open RabbitMQ connection."""
        self._reset_rmq()
        logger.info("Publisher connections closed.")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_rmq_channel(self) -> pika.channel.Channel:
        """Return an open RabbitMQ channel, reconnecting if necessary."""
        if self._rmq_connection is None or self._rmq_connection.is_closed:
            logger.info(
                f"[RabbitMQ] Connecting to {self.rabbitmq_host}:{self.rabbitmq_port}…"
            )
            params = pika.ConnectionParameters(
                host=self.rabbitmq_host,
                port=self.rabbitmq_port,
                connection_attempts=2,
                retry_delay=1,
            )
            self._rmq_connection = pika.BlockingConnection(params)
            self._rmq_channel    = self._rmq_connection.channel()
            # Declare exchange (topic type allows wildcard routing)
            self._rmq_channel.exchange_declare(
                exchange=self.rabbitmq_exchange,
                exchange_type="topic",
                durable=True,
            )
            logger.info("[RabbitMQ] Connected and exchange declared.")

        if self._rmq_channel is None or self._rmq_channel.is_closed:
            self._rmq_channel = self._rmq_connection.channel()

        return self._rmq_channel

    def _reset_rmq(self) -> None:
        """Close and discard the RabbitMQ connection."""
        try:
            if self._rmq_connection and not self._rmq_connection.is_closed:
                self._rmq_connection.close()
        except Exception:
            pass
        self._rmq_connection = None
        self._rmq_channel    = None
