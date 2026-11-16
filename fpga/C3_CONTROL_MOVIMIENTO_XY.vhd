library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

-- C3_CONTROL_MOVIMIENTO_XY: controlador de movimientos, velocidades y estados.
-- Interpola XY (o Z por separado) en medios pasos mediante DDA/Bresenham.
-- Un unico reloj clk. Los pulsos step_x/y/z son CLOCK ENABLES de un ciclo.
-- Restriccion: movimiento Z separado de XY (protege el trazo del plumon).
-- El conteo es POSICION COMANDADA; sin encoders no se verifica posicion real.
entity C3_CONTROL_MOVIMIENTO_XY is
  generic (CLOCK_HZ : positive := 50000000;
           RAMPA_PASOS : positive := 32);
  port(clk : in std_logic; rst : in std_logic; estop_n : in std_logic;
       movimiento_valido : in std_logic;
       movimiento_calibracion_valido : in std_logic;
       limit_x_n : in std_logic; limit_y_n : in std_logic; limit_z_n : in std_logic;
       USE_LIMIT_SWITCHES : in std_logic;
       zero_pos : out std_logic;
       cmd_valid : in std_logic; bad_checksum : in std_logic;
       cmd : in std_logic_vector(7 downto 0);
       dx : in signed(15 downto 0); dy : in signed(15 downto 0);
       dz : in signed(15 downto 0); rate : in std_logic_vector(7 downto 0);
       step_x : out std_logic; step_y : out std_logic; step_z : out std_logic;
       dir_x : out std_logic; dir_y : out std_logic; dir_z : out std_logic;
       motors_enabled : out std_logic; motion_busy : out std_logic;
       response_valid : out std_logic;
       response_code : out std_logic_vector(7 downto 0));
end C3_CONTROL_MOVIMIENTO_XY;

architecture RTL of C3_CONTROL_MOVIMIENTO_XY is
  type state_t is (READY, RUN);
  signal state : state_t := READY;
  signal enabled_r, referenced_r : std_logic := '0';
  signal is_calibration : std_logic := '0';
  signal estop_latched : std_logic := '0';
  signal dir_x_r, dir_y_r, dir_z_r : std_logic := '1';
  signal ax,ay,az : integer range 0 to 32768 := 0;
  signal ex,ey,ez : integer range 0 to 32768 := 0;
  signal total_steps : integer range 0 to 32768 := 0;
  signal completed : integer range 0 to 32768 := 0;
  signal target_level : integer range 0 to 4 := 0;
  signal speed_level : integer range 0 to 4 := 0;
  signal speed_count : integer range 0 to CLOCK_HZ/80 := 0;
  signal sx,sy,sz : std_logic := '0';
  signal zp : std_logic := '0';
  signal rv : std_logic := '0';
  signal rc : std_logic_vector(7 downto 0) := (others => '0');

  function largest(a,b,c : integer) return integer is
    variable v : integer;
  begin
    v := a;
    if b > v then v := b; end if;
    if c > v then v := c; end if;
    return v;
  end function;

  function ticks_for(level : integer) return integer is
  begin
    case level is
      when 0 => return CLOCK_HZ/80;  -- 80 medios pasos/s
      when 1 => return CLOCK_HZ/120;
      when 2 => return CLOCK_HZ/180;
      when 3 => return CLOCK_HZ/240;
      when others => return CLOCK_HZ/320;
    end case;
  end function;
begin
  step_x <= sx; step_y <= sy; step_z <= sz;
  zero_pos <= zp;
  dir_x <= dir_x_r; dir_y <= dir_y_r; dir_z <= dir_z_r;
  motors_enabled <= enabled_r and estop_n and not estop_latched;
  motion_busy <= '1' when state = RUN else '0';
  response_valid <= rv;
  response_code <= rc;

  process(clk)
    variable mx,my,mz,major : integer;
    variable ne_x,ne_y,ne_z : integer;
    variable do_x,do_y,do_z : boolean;
    variable blocked : boolean;
    variable want_level : integer;
    variable remaining : integer;
  begin
    if rising_edge(clk) then
      sx <= '0'; sy <= '0'; sz <= '0'; rv <= '0'; zp <= '0';
      if rst = '1' then
        state <= READY; enabled_r <= '0'; referenced_r <= '0'; estop_latched <= '0';
        ex <= 0; ey <= 0; ez <= 0;
        completed <= 0; speed_count <= 0;
        dir_x_r <= '1'; dir_y_r <= '1'; dir_z_r <= '1';
      elsif estop_n = '0' then
        -- E-stop de prioridad maxima. Requiere RESET para volver a habilitar.
        enabled_r <= '0'; referenced_r <= '0'; state <= READY;
        estop_latched <= '1'; speed_count <= 0;
        if state = RUN then
          rv <= '1'; rc <= x"E6";
        end if;
      elsif estop_latched = '1' then
        -- Fallo enclavado: únicamente RESET físico permite rearmar.
        enabled_r <= '0'; referenced_r <= '0'; state <= READY;
      else
        case state is
          when READY =>
            if bad_checksum = '1' then
              rv <= '1'; rc <= x"E1";
            elsif cmd_valid = '1' then
              case cmd is
                when x"02" =>   -- ZERO: establecer origen manual
                  zp <= '1'; referenced_r <= '1'; rv <= '1'; rc <= x"00";
                when x"03" =>   -- ENABLE
                  enabled_r <= '1'; rv <= '1'; rc <= x"00";
                when x"04" =>   -- DISABLE: se pierde referencia confiable
                  enabled_r <= '0'; referenced_r <= '0'; rv <= '1'; rc <= x"00";
                when x"05" =>   -- STOP, ya detenido
                  rv <= '1'; rc <= x"00";
                when x"06" =>   -- STATUS (00 listo; E2 sin referencia)
                  rv <= '1';
                  if referenced_r = '1' then rc <= x"00";
                  else rc <= x"E2"; end if;
                when x"01" | x"07" =>   -- MOVE normal o JOG de calibracion
                  mx := to_integer(dx); my := to_integer(dy); mz := to_integer(dz);
                  if enabled_r = '0' or (referenced_r = '0' and cmd /= x"07") then
                    rv <= '1'; rc <= x"E2";
                  elsif (mx /= 0 or my /= 0) and mz /= 0 then
                    rv <= '1'; rc <= x"E3";  -- Z no se mueve junto a XY
                  elsif (cmd = x"07" and (abs(mx)>100 or abs(my)>100 or abs(mz)>100)) then
                    rv <= '1'; rc <= x"E4"; -- JOG max 100 medios pasos por orden
                  elsif (cmd = x"01" and movimiento_valido = '0') or
                        (cmd = x"07" and (movimiento_calibracion_valido = '0')) then
                    rv <= '1'; rc <= x"E4";
                  else
                    if cmd = x"07" then is_calibration <= '1';
                    else is_calibration <= '0'; end if;
                    ax <= abs(mx); ay <= abs(my); az <= abs(mz);
                    major := largest(abs(mx),abs(my),abs(mz));
                    total_steps <= major; completed <= 0;
                    ex <= 0; ey <= 0; ez <= 0;
                    if mx < 0 then dir_x_r <= '0'; else dir_x_r <= '1'; end if;
                    if my < 0 then dir_y_r <= '0'; else dir_y_r <= '1'; end if;
                    if mz < 0 then dir_z_r <= '0'; else dir_z_r <= '1'; end if;
                    speed_level <= 0; speed_count <= 0;
                    if unsigned(rate) > 4 then target_level <= 4;
                    else target_level <= to_integer(unsigned(rate)); end if;
                    if major = 0 then rv <= '1'; rc <= x"00";
                    else state <= RUN; end if;
                  end if;
                when others =>
                  rv <= '1'; rc <= x"E0";
              end case;
            end if;
          when RUN =>
            if cmd_valid = '1' and cmd = x"05" then
              -- STOP ejecutado incluso durante movimientos. Puede requerir ZERO posterior.
              state <= READY; referenced_r <= '0';
              speed_count <= 0; rv <= '1'; rc <= x"E5";
            elsif speed_count + 1 < ticks_for(speed_level) then
              speed_count <= speed_count + 1;
            else
              speed_count <= 0;
              ne_x := ex + ax; ne_y := ey + ay; ne_z := ez + az;
              do_x := ne_x >= total_steps;
              do_y := ne_y >= total_steps;
              do_z := ne_z >= total_steps;
              blocked := false;
              if USE_LIMIT_SWITCHES = '1' then
                if do_x and dir_x_r = '0' and limit_x_n = '0' then blocked := true; end if;
                if do_y and dir_y_r = '0' and limit_y_n = '0' then blocked := true; end if;
                if do_z and dir_z_r = '0' and limit_z_n = '0' then blocked := true; end if;
              end if;
              if blocked then
                state <= READY; referenced_r <= '0'; rv <= '1'; rc <= x"E4";
              else
                if do_x then
                  sx <= '1'; ex <= ne_x - total_steps;
                else ex <= ne_x; end if;
                if do_y then
                  sy <= '1'; ey <= ne_y - total_steps;
                else ey <= ne_y; end if;
                if do_z then
                  sz <= '1'; ez <= ne_z - total_steps;
                else ez <= ne_z; end if;
                if completed + 1 = total_steps then
                  state <= READY; rv <= '1'; rc <= x"00";
                else
                  completed <= completed + 1;
                  -- Rampa discreta: un cambio de nivel cada RAMPA_PASOS medios pasos.
                  remaining := total_steps - completed - 1;
                  want_level := speed_level;
                  if remaining <= speed_level * RAMPA_PASOS and speed_level > 0 then
                    want_level := speed_level - 1;
                  elsif (completed + 1) mod RAMPA_PASOS = 0 and
                        speed_level < target_level and
                        remaining > (speed_level + 1)*RAMPA_PASOS then
                    want_level := speed_level + 1;
                  end if;
                  speed_level <= want_level;
                end if;
              end if;
            end if;
        end case;
      end if;
    end if;
  end process;
end RTL;